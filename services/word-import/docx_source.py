"""Read DOCX without executing Word, macros, links, or embedded OLE programs."""
import base64
import hashlib
import io
import json
import posixpath
import re
import zipfile
from pathlib import Path

from lxml import etree as ET
from PIL import Image
from mathml_to_latex.converter import MathMLToLaTeX
from mathtypejx.models import FormulaInfo
from mathtypejx.extractor import extract_mtef
from mathtypejx.converter import convert_formula
from mathtypejx.wmf_extractor import extract_from_wmf

NS = dict(w='http://schemas.openxmlformats.org/wordprocessingml/2006/main',
          m='http://schemas.openxmlformats.org/officeDocument/2006/math',
          r='http://schemas.openxmlformats.org/officeDocument/2006/relationships',
          a='http://schemas.openxmlformats.org/drawingml/2006/main',
          o='urn:schemas-microsoft-com:office:office', v='urn:schemas-microsoft-com:vml')
Image.MAX_IMAGE_PIXELS = 16000000


def xml(data):
    if b'<!DOCTYPE' in data or b'<!ENTITY' in data:
        raise ValueError('DTD/entities are not allowed')
    return ET.fromstring(data, ET.XMLParser(resolve_entities=False, no_network=True))


def office_xsl(name):
    for base in ('C:/Program Files/Microsoft Office/root/Office16', 'C:/Program Files (x86)/Microsoft Office/root/Office16'):
        path = Path(base) / name
        if path.is_file():
            return str(path)
    raise RuntimeError(f'Missing Microsoft Office {name}')


class DocxSource:
    def __init__(self, path, job_id, upload_image, checkpoint=lambda **kw: None):
        self.zip = zipfile.ZipFile(path)
        names = self.zip.namelist()
        if len(names) > 15000 or sum(x.file_size for x in self.zip.infolist()) > 200 * 1024 * 1024:
            self.zip.close()
            raise ValueError('DOCX package exceeds safe limits')
        if any(n.startswith('/') or '\\' in n or '..' in n.split('/') for n in names):
            self.zip.close()
            raise ValueError('Unsafe DOCX package path')
        self.job_id, self.upload_image, self.checkpoint = job_id, upload_image, checkpoint
        self.blocks, self.media_cache, self.formula_cache = {}, {}, {}
        self.stats = dict(formulas=0, converted=0, formula_errors=0, images=0, image_errors=0, tables=0)
        self.rels = {}
        for rel in xml(self.zip.read('word/_rels/document.xml.rels')):
            if rel.get('TargetMode') == 'External':
                continue
            target = posixpath.normpath(posixpath.join('word', rel.get('Target', '')))
            if target.startswith('word/') and '..' not in target.split('/'):
                self.rels[rel.get('Id')] = target
        self.document = xml(self.zip.read('word/document.xml'))
        self.numbering, self.counts = {}, {}
        if 'word/numbering.xml' in names:
            numbering = xml(self.zip.read('word/numbering.xml'))
            abstract = {a.get('{%s}abstractNumId' % NS['w']): a for a in numbering.findall('w:abstractNum', NS)}
            for num in numbering.findall('w:num', NS):
                aid = num.find('w:abstractNumId', NS)
                if aid is not None:
                    self.numbering[num.get('{%s}numId' % NS['w'])] = (abstract.get(aid.get('{%s}val' % NS['w'])), num)

    def block(self, text, warnings=None):
        key = f'WORDBLOCK{len(self.blocks) + 1}TOKEN'
        self.blocks[key] = dict(text=text, warnings=warnings or [])
        return key

    def image(self, path):
        if not path:
            return self.block('[HÌNH ẢNH LỖI]', ['Không tìm thấy ảnh gốc; đối chiếu file Word.'])
        if path in self.media_cache:
            return self.media_cache[path]
        try:
            with Image.open(io.BytesIO(self.zip.read(path))) as image:
                if image.width * image.height > 16000000:
                    raise ValueError('Image exceeds 16 megapixels')
                image.load()
                image.thumbnail((2400, 2400))
                output = io.BytesIO()
                image.convert('RGBA').save(output, 'PNG')
            png = output.getvalue()
            if len(png) > 4194304:
                raise ValueError('PNG exceeds 4 MB')
            name = hashlib.sha256(png).hexdigest() + '.png'
            self.upload_image(name, png)
            token = self.block(f'[[WIMG:{self.job_id}/{name}]]')
            self.stats['images'] += 1
        except Exception as exc:
            token = self.block('[HÌNH ẢNH LỖI]', [f'Ảnh {posixpath.basename(path)} chưa chuyển được: {type(exc).__name__}.'])
            self.stats['image_errors'] += 1
        self.media_cache[path] = token
        return token

    def latex(self, mathml):
        root = xml(mathml.encode())
        # The third-party converter expects unprefixed MathML and has no silent fallback for unsupported tags here.
        allowed = {'math','mrow','mi','mn','mo','mtext','mfrac','msqrt','mroot','msub','msup','msubsup',
                   'munder','mover','munderover','mfenced','mtable','mtr','mtd','mstyle','mspace','menclose'}
        for node in root.iter():
            name = ET.QName(node).localname
            if name not in allowed:
                raise ValueError('Unsupported MathML element: ' + name)
            node.tag = name
        ET.cleanup_namespaces(root)
        latex = MathMLToLaTeX().convert(ET.tostring(root, encoding='unicode'))
        if not latex.strip() or '<' in latex and '<math' in latex:
            raise ValueError('Empty/invalid LaTeX output')
        return '$' + latex.replace('\n', ' ') + '$'

    def formula(self, node):
        identity = ET.tostring(node)
        if identity in self.formula_cache:
            return self.formula_cache[identity]
        self.stats['formulas'] += 1
        warning = []
        try:
            if ET.QName(node).namespace == NS['m']:
                transform = ET.XSLT(ET.parse(office_xsl('OMML2MML.XSL')), access_control=ET.XSLTAccessControl.DENY_ALL)
                mathml = str(transform(node))
                warning = ['Equation: kiểm tra đối chiếu công thức với file gốc.']
            else:
                ole = node.find('.//o:OLEObject', NS)
                image = node.find('.//v:imagedata', NS)
                rid = (ole if ole is not None else image).get('{%s}id' % NS['r'])
                path = self.rels.get(rid)
                if not path:
                    raise ValueError('Missing embedded equation')
                f = FormulaInfo(formula_id=rid, ole_name=path, part_name='word/document.xml',
                                rels_path='', relationship_id=rid, prog_id=ole.get('ProgID') if ole is not None else '')
                data = self.zip.read(path)
                if ole is not None:
                    if not extract_mtef(f, data):
                        raise ValueError(f.error_message)
                else:
                    embedded = extract_from_wmf(data)
                    f.mtef_bytes, f.mathml = embedded.mtef_bytes, embedded.mathml
                if not convert_formula(f, xsl_path=office_xsl('MML2OMML.XSL')):
                    raise ValueError(f.error_message)
                mathml = f.mathml
                if f.risk_level.value != 'auto_replace':
                    warning = [f'MathType {posixpath.basename(path)}: cần đối chiếu ({f.risk_level.value}).']
                warning += f.quality_warnings
            value = self.latex(mathml)
            self.stats['converted'] += 1
        except Exception as exc:
            value = '[CÔNG THỨC LỖI]'
            preview = node.find('.//v:imagedata', NS)
            if preview is not None:
                value += ' ' + self.expand(self.image(self.rels.get(preview.get('{%s}id' % NS['r']))))
            warning.append(f'Công thức chưa chuyển được ({type(exc).__name__}); cần đối chiếu file gốc.')
            self.stats['formula_errors'] += 1
        token = self.block(value, warning)
        self.formula_cache[identity] = token
        self.checkpoint(phase='converting', **self.stats)
        return token

    def expand(self, text):
        return re.sub(r'WORDBLOCK\d+TOKEN', lambda m: self.blocks[m[0]]['text'], text)

    def inline(self, node):
        tag = ET.QName(node).localname
        ns = ET.QName(node).namespace
        if ns == NS['m'] and tag in ('oMath', 'oMathPara'):
            return self.formula(node)
        if tag == 'object' and node.find('.//o:OLEObject', NS) is not None:
            return self.formula(node)
        if tag in ('drawing','pict'):
            if node.find('.//v:imagedata', NS) is not None:
                picture = node.find('.//v:imagedata', NS)
                path = self.rels.get(picture.get('{%s}id' % NS['r']))
                if path and path.lower().endswith('.wmf'):
                    from mathtypejx.wmf_extractor import wmf_has_mtef_signature
                    if wmf_has_mtef_signature(self.zip.read(path)):
                        return self.formula(node)
                return self.image(path)
            blips = node.findall('.//a:blip', NS)
            return ''.join(self.image(self.rels.get(b.get('{%s}embed' % NS['r']))) for b in blips) if blips else self.image(None)
        if ns == NS['w'] and tag == 't':
            return node.text or ''
        if ns == NS['w'] and tag in ('br','cr'):
            return '\n'
        if ns == NS['w'] and tag == 'tab':
            return ' '
        if tag in ('del','instrText','pPr','rPr','txbxContent'):
            return ''
        if tag == 'AlternateContent':
            choice = next(iter(node), None)
            return self.inline(choice) if choice is not None else ''
        return ''.join(self.inline(child) for child in node)

    def prefix(self, para):
        props = para.find('w:pPr/w:numPr', NS)
        if props is None:
            return ''
        num = props.find('w:numId', NS)
        level = props.find('w:ilvl', NS)
        nid = num.get('{%s}val' % NS['w']) if num is not None else None
        depth = level.get('{%s}val' % NS['w']) if level is not None else '0'
        abstract, override = self.numbering.get(nid, (None,None))
        if abstract is None:
            return ''
        lvl = abstract.find(f"w:lvl[@w:ilvl='{depth}']", NS)
        if lvl is None:
            return ''
        fmt = lvl.find('w:numFmt', NS)
        fmt = fmt.get('{%s}val' % NS['w']) if fmt is not None else ''
        start = lvl.find('w:start', NS)
        initial = int(start.get('{%s}val' % NS['w'])) if start is not None else 1
        over = override.find(f"w:lvlOverride[@w:ilvl='{depth}']/w:startOverride", NS)
        if over is not None:
            initial = int(over.get('{%s}val' % NS['w']))
        key = (nid,depth)
        count = self.counts.get(key, initial-1)+1
        self.counts[key] = count
        for other in list(self.counts):
            if other[0] == nid and int(other[1]) > int(depth):
                del self.counts[other]
        if fmt == 'decimal':
            return f'Câu {count}: ' if depth == '0' else f'{count}. '
        if fmt in ('upperLetter','lowerLetter') and count <= 26:
            return chr((65 if fmt == 'upperLetter' else 97)+count-1)+'. '
        return ''

    def paragraph(self, para):
        return self.prefix(para) + self.inline(para)

    def table(self, node):
        self.stats['tables'] += 1
        rows, active_merges, warnings, option_texts = [], {}, [], []
        for tr in node.findall('w:tr', NS):
            cells, column = [], 0
            for tc in tr.findall('w:tc', NS):
                span = tc.find('w:tcPr/w:gridSpan', NS)
                colspan = int(span.get('{%s}val' % NS['w'])) if span is not None else 1
                merge = tc.find('w:tcPr/w:vMerge', NS)
                if merge is not None and merge.get('{%s}val' % NS['w']) != 'restart':
                    if column in active_merges:
                        active_merges[column]['rowspan'] += 1
                    column += colspan
                    continue
                content = '\n'.join(self.paragraph(p) if ET.QName(p).localname=='p' else self.table(p)
                                    for p in tc if ET.QName(p).localname in ('p','tbl'))
                option_texts.append(content)
                warnings.extend(w for key in re.findall(r'WORDBLOCK\d+TOKEN', content) for w in self.blocks[key]['warnings'])
                cell = dict(text=self.expand(content), colspan=colspan, rowspan=1)
                cells.append(cell)
                active_merges.pop(column, None)
                if merge is not None:
                    active_merges[column] = cell
                column += colspan
            rows.append(cells)
        texts = [c['text'].strip() for row in rows for c in row]
        if any(re.search(r'(?:^|\n)Câu\s+\d+\s*[:.)]', s) for s in option_texts) or (len(texts) >= 2 and all(re.match(r'^[A-Fa-d][.)]\s*', s) for s in texts)):
            # Keep option tables as option lines so the existing bank parser can recognise them.
            return '\n'.join(option_texts)
        # Cell content was expanded; propagate diagnostics from its original token references.
        warnings.append('Bảng: kiểm tra ô gộp, nội dung và hình ảnh trước khi duyệt.')
        encoded = base64.b64encode(json.dumps(rows,ensure_ascii=False).encode()).decode()
        return self.block('[[WTABLE:'+encoded+']]', warnings)

    def read(self):
        try:
            lines = []
            for node in self.document.find('w:body', NS):
                tag = ET.QName(node).localname
                if tag == 'p':
                    lines.append(self.paragraph(node))
                elif tag == 'tbl':
                    lines.append(self.table(node))
                self.checkpoint(phase='reading', **self.stats)
            return dict(text='\n'.join(lines), blocks=self.blocks, stats=self.stats)
        finally:
            self.zip.close()
