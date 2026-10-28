import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from worker import Job, LeaseLost


class FakeGateway:
    url='https://example.supabase.co/functions/v1/word-import-gateway'
    def __init__(self, active=True):self.active=active;self.calls=[]
    def call(self, action, **data):
        self.calls.append((action,data))
        return dict(active=self.active)


class WorkerTests(unittest.TestCase):
    def test_lost_lease_stops_further_writes(self):
        gateway=FakeGateway(False)
        job=Job(gateway,dict(id='job',token='token'))
        with self.assertRaises(LeaseLost):job.cycle()
        with self.assertRaises(LeaseLost):job.cycle()
        self.assertEqual(len(gateway.calls),1)

    def test_image_upload_checks_lease(self):
        job=Job(FakeGateway(False),dict(id='job',token='token'))
        with self.assertRaises(LeaseLost):job.upload('image.png',b'png')
        self.assertTrue(job.lease_lost)

    def test_cached_drafts_resume_without_word_conversion(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache=Path(tmp)/'job.drafts.json'
            cache.write_text(json.dumps(dict(stats={'converted':128},items=[dict(ordinal=1,payload={'question_text':'test'})])),encoding='utf8')
            gateway=FakeGateway()
            job=Job(gateway,dict(id='job',token='token',download_url='https://example.supabase.co/source'))
            with patch('worker.STATE',Path(tmp)),patch('worker.urllib.request.urlopen',side_effect=AssertionError('Must not download again')):
                job.run()
            self.assertFalse(cache.exists())
            self.assertEqual([call[1]['status'] for call in gateway.calls],['processing','completed'])
            self.assertEqual(gateway.calls[0][1]['items'][0]['ordinal'],1)


if __name__=='__main__':unittest.main()
