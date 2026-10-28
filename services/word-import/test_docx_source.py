import base64
import io
import json
from pathlib import Path
import re
import tempfile
import unittest
import zipfile

from PIL import Image
from docx_source import DocxSource, NS, xml


class WordSourceTests(unittest.TestCase):
    def read(self, body, parts=None):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        path = Path(temporary.name) / 'test.docx'
        image = io.BytesIO()
        Image.new('RGB',(20,20),'red').save(image,'PNG')
        rels = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Target="media/one.png"/><Relationship Id="r2" Target="media/two.png"/><Relationship Id="external" TargetMode="External" Target="https://invalid.example/private"/></Relationships>'
        with zipfile.ZipFile(path,'w') as z:
            z.writestr('word/document.xml','<w:document '+ ' '.join(f'xmlns:{k}="{v}"' for k,v in NS.items())+'><w:body>'+body+'</w:body></w:document>')
            z.writestr('word/_rels/document.xml.rels',rels)
            z.writestr('word/media/one.png',image.getvalue())
            z.writestr('word/media/two.png',image.getvalue())
            for name,data in (parts or {}).items():z.writestr(name,data)
        uploaded = []
        source = DocxSource(path,'00000000-0000-4000-8000-000000000000',lambda name,png:uploaded.append(name))
        result = source.read()
        return source, result, uploaded

    def test_inline_images_remain_in_order(self):
        source,result,uploaded=self.read('<w:p><w:r><w:t>Câu 1: trước </w:t><w:drawing><a:blip r:embed="r1"/></w:drawing><w:t> giữa </w:t><w:drawing><a:blip r:embed="r2"/></w:drawing><w:t> sau</w:t></w:r></w:p>')
        text=source.expand(result['text'])
        self.assertRegex(text,r'trước \[\[WIMG:.* giữa \[\[WIMG:.* sau')
        self.assertEqual(result['stats']['images'],2)

    def test_omml_fraction_becomes_latex(self):
        source,result,_=self.read('<w:p><w:r><w:t>Câu 1: </w:t></w:r><m:oMath><m:f><m:num><m:r><m:t>x</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f></m:oMath></w:p>')
        self.assertEqual(result['stats']['converted'],1)
        self.assertIn('frac',source.expand(result['text']))
        self.assertIn('x',source.expand(result['text']))

    def test_table_keeps_spans_and_images(self):
        source,result,_=self.read('<w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:drawing><a:blip r:embed="r1"/></w:drawing></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:vMerge/></w:tcPr><w:p/></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>')
        encoded=re.search(r'\[\[WTABLE:([^\]]+)',source.expand(result['text']))[1]
        rows=json.loads(base64.b64decode(encoded))
        self.assertEqual(rows[0][0]['colspan'],2)
        self.assertEqual(rows[0][0]['rowspan'],2)
        self.assertIn('[[WIMG:',rows[0][1]['text'])

    def test_options_in_table_are_not_flattened_to_rich_table(self):
        source,result,_=self.read('<w:tbl>'+''.join('<w:tr><w:tc><w:p><w:r><w:t>'+label+'. Nội dung</w:t></w:r></w:p></w:tc></w:tr>' for label in 'ABCD')+'</w:tbl>')
        self.assertEqual(result['text'].splitlines(),[x+'. Nội dung' for x in 'ABCD'])

    def test_external_images_never_fetched(self):
        source,result,uploaded=self.read('<w:p><w:r><w:drawing><a:blip r:embed="external"/></w:drawing></w:r></w:p>')
        self.assertEqual(uploaded,[])
        self.assertIn('[HÌNH ẢNH LỖI]',source.expand(result['text']))

    def test_broken_equation_remains_flagged_with_preview(self):
        source,result,_=self.read('<w:p><w:r><w:object><v:shape><v:imagedata r:id="r1"/></v:shape><o:OLEObject ProgID="Equation.DSMT4" r:id="missing"/></w:object></w:r></w:p>')
        text=source.expand(result['text'])
        self.assertIn('[CÔNG THỨC LỖI]',text)
        self.assertIn('[[WIMG:',text)
        self.assertEqual(result['stats']['formula_errors'],1)

    def test_numbered_questions(self):
        numbering='<w:numbering xmlns:w="'+NS['w']+'"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>'
        body=''.join('<w:p><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Nội dung</w:t></w:r></w:p>' for _ in range(2))
        _,result,_=self.read(body,{'word/numbering.xml':numbering})
        self.assertEqual(result['text'],'Câu 1: Nội dung\nCâu 2: Nội dung')

    def test_entities_rejected(self):
        with self.assertRaises(ValueError):xml(b'<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><x>&y;</x>')

    def test_unsafe_zip_rejected(self):
        with self.assertRaises(ValueError):self.read('',{'../outside':'bad'})


if __name__=='__main__':unittest.main()
