"""Hospital-side outbound polling bridge. Never starts a public HTTP listener."""
import ipaddress,json,os,socket,time,urllib.request,urllib.error,uuid
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

def epl_label(payload,printer):
    if int(printer['dpi'])!=203:raise ValueError('EPL requires the configured 203 dpi printer')
    w=int(float(printer['width_mm'])*8);h=int(float(printer['height_mm'])*8)
    if not 200<=w<=832 or not 200<=h<=1200:raise ValueError('Unsupported roll dimensions')
    copies=payload.get('copies',1)
    if isinstance(copies,bool) or int(copies)!=copies or not 1<=copies<=20:raise ValueError('Copies must be 1–20')
    kind=payload.get('kind')
    if kind not in ('Patient','Line','Tube','Infusion','IV fluids'):raise ValueError('Unsupported label type')
    if not str(payload.get('patientName','')).strip() or not str(payload.get('mrn','')).strip():raise ValueError('Patient name and MRN required')
    if kind!='Patient' and not str(payload.get('item','')).strip():raise ValueError('Item name required')
    if kind in ('Infusion','IV fluids') and not all(str(payload.get(k,'')).strip() for k in ('rate','prepared','by')):raise ValueError('Rate, preparation time and practitioner required')
    if kind=='Infusion' and not str(payload.get('concentration','')).strip():raise ValueError('Concentration required')
    candidates=[os.getenv('KAASH_FONT',''),'/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','C:/Windows/Fonts/arial.ttf']
    font_path=next((x for x in candidates if x and Path(x).is_file()),None)
    if not font_path:raise ValueError('Set KAASH_FONT to a TrueType font file')
    font=ImageFont.truetype(font_path,22)
    lines=['ICU KAASH | '+kind,str(payload['patientName']),'MRN: '+str(payload['mrn']),'Bed: '+str(payload.get('bed',''))]
    fields=[('Item','item'),('Site','site'),('Size','size'),('Concentration','concentration'),('Rate','rate'),('Prepared','prepared'),('Expiry','expiry'),('By','by')]
    if kind!='Patient':lines.extend(label+': '+str(payload[key]) for label,key in fields if payload.get(key))
    image=Image.new('1',(w,h),1);draw=ImageDraw.Draw(image);y=12
    for text in lines:
        if len(text)>400:raise ValueError('Label field too long')
        words=text.replace('\r',' ').replace('\n',' ').split();wrapped=[];current=''
        for word in words:
            if draw.textlength(word,font=font)>w-24:raise ValueError('Unbroken text exceeds label width')
            candidate=(current+' '+word).strip()
            if draw.textlength(candidate,font=font)>w-24:wrapped.append(current);current=word
            else:current=candidate
        if current:wrapped.append(current)
        for line in wrapped:
            if y+28>h-12:raise ValueError('Content does not fit this small label. Increase configured size or shorten fields.')
            draw.text((12,y),line,font=font,fill=0);y+=28
    # EPL GW: one bit per pixel, black=1. Rows padded to whole bytes.
    byte_width=(w+7)//8;bitmap=bytearray()
    for row in range(h):
        for start in range(0,byte_width*8,8):
            value=0
            for bit in range(8):
                col=start+bit
                if col<w and image.getpixel((col,row))==0:value|=1<<(7-bit)
            bitmap.append(value)
    gap=int(float(printer.get('gap_mm',2))*8)
    header=f'N\nq{w}\nQ{h},{gap}\nGW0,0,{byte_width},{h},'.encode('ascii')
    return header+bytes(bitmap)+f'\nP{copies}\n'.encode('ascii')

class Bridge:
    def __init__(self):
        self.url=os.environ['SUPABASE_URL'].rstrip('/');self.key=os.environ['SUPABASE_PUBLISHABLE_KEY'];self.email=os.environ['BRIDGE_EMAIL'];self.password=os.environ['BRIDGE_PASSWORD'];self.token=None;self.refresh=None;self.expires=0
        self.allowed={str(ipaddress.ip_address(x.strip())) for x in os.environ['PRINTER_ALLOWED_IPS'].split(',') if x.strip()}
        if not self.allowed:raise ValueError('Set PRINTER_ALLOWED_IPS')
    def request(self,path,body,auth=True):
        if auth and time.time()>self.expires-60:self.login()
        headers={'apikey':self.key,'Content-Type':'application/json'}
        if auth:headers['Authorization']='Bearer '+self.token
        req=urllib.request.Request(self.url+path,data=json.dumps(body).encode(),headers=headers,method='POST')
        with urllib.request.urlopen(req,timeout=15) as response:
            data=response.read();return json.loads(data) if data else None
    def login(self):
        body={'refresh_token':self.refresh} if self.refresh else {'email':self.email,'password':self.password}
        grant='refresh_token' if self.refresh else 'password'
        try:data=self.request('/auth/v1/token?grant_type='+grant,body,False)
        except urllib.error.HTTPError:
            self.refresh=None;data=self.request('/auth/v1/token?grant_type=password',{'email':self.email,'password':self.password},False)
        self.token=data['access_token'];self.refresh=data['refresh_token'];self.expires=time.time()+data['expires_in']
    def tick(self):
        work=self.request('/rest/v1/rpc/kaash_claim_print_job',{})
        if not work:return False
        job,printer=work['job'],work['printer'];started=False
        try:
            host=str(ipaddress.ip_address(str(printer['host']).split('/')[0]))
            if host not in self.allowed:raise ValueError('Printer IP not in local allowlist')
            if int(printer['port'])!=9100:raise ValueError('Unsupported port')
            data=epl_label(job['payload'],printer)
            with socket.create_connection((host,9100),timeout=10) as conn:
                started=True;conn.sendall(data)
            result='sent';note='Bytes delivered to printer socket; physical print not confirmed'
        except Exception:
            result='unknown' if started else 'failed';note='Uncertain send; do not auto-retry' if started else 'Validation or connection failed; inspect local configuration'
        self.request('/rest/v1/rpc/kaash_finish_print_job',{'job_id':job['id'],'result':result,'note':note})
        print('Job',job['id'],result,flush=True);return True
    def run(self):
        while True:
            try:busy=self.tick()
            except Exception:print('Bridge connection unavailable; no automatic reprint',flush=True);busy=False
            if not busy:time.sleep(5)
if __name__=='__main__':Bridge().run()
