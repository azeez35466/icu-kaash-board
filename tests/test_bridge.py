import importlib.util, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('bridge',Path(__file__).parents[1]/'print-bridge'/'bridge.py');bridge=importlib.util.module_from_spec(spec);spec.loader.exec_module(bridge)
class EPLTests(unittest.TestCase):
 def setUp(self):self.printer={'dpi':203,'width_mm':80,'height_mm':50,'gap_mm':2};self.payload={'kind':'Patient','patientName':'Fictional sample','mrn':'DEMO-1','bed':'ICU01','copies':1}
 def test_raster_dimensions(self):
  result=bridge.epl_label(self.payload,self.printer);header=b'N\nq640\nQ400,16\nGW0,0,80,400,';self.assertTrue(result.startswith(header));self.assertEqual(len(result),len(header)+80*400+len(b'\nP1\n'))
 def test_non_epl_dpi_rejected(self):
  with self.assertRaises(ValueError):bridge.epl_label(self.payload,{**self.printer,'dpi':300})
 def test_missing_identity_rejected(self):
  with self.assertRaises(ValueError):bridge.epl_label({**self.payload,'mrn':''},self.printer)
 def test_oversized_text_rejected(self):
  with self.assertRaises(ValueError):bridge.epl_label({**self.payload,'patientName':'X'*400},self.printer)
 def test_infusion_fields_required(self):
  with self.assertRaises(ValueError):bridge.epl_label({**self.payload,'kind':'Infusion','item':'Example'},self.printer)
 def test_no_raw_command_injection(self):
  result=bridge.epl_label({**self.payload,'patientName':'Sample\nP20\nN'},self.printer);self.assertNotIn(b'P20',result[:30]);self.assertTrue(result.endswith(b'\nP1\n'))
if __name__=='__main__':unittest.main()
