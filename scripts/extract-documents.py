# Extrae registros/vigencias de PDFs ya convertidos con pdftotext -layout a ~/txt. Uso: cd ~/txt && python3 scripts/extract-documents.py
import re,glob,os,csv,sys
from datetime import date
today=date(2026,10,13)
def d(s):
    s=s.replace('-','/')
    p=s.split('/')
    try:
        if len(p[0])==4: return date(int(p[0]),int(p[1]),int(p[2]))
        return date(int(p[2]),int(p[1]),int(p[0]))
    except: return None
rows=[]
for f in sorted(glob.glob('*.txt')):
    t=open(f,errors='ignore').read()
    regs=sorted(set(re.findall(r'REGISTRO SANITARIO\s+No\.?\s*:?\s*([0-9A-Z\-\.]+)',t,re.I)))
    regs+=sorted(set(re.findall(r'\b(\d{3,6}-[A-Z]{2,4}-\d{3,4})\b',t)))
    regs=sorted(set(regs))[:6]
    vig=[]
    for m in re.finditer(r'Fecha de Vigencia de\s*\n?.*?(\d{2}/\d{2}/\d{4})\s+Registro Sanitario\s*:\s*(\d{2}/\d{2}/\d{4})',t,re.S):
        vig.append(('RS',m.group(2)))
    for m in re.finditer(r'Registro Sanitario\s*:\s*(\d{2}/\d{2}/\d{4})\s+Registro Sanitario\s*:\s*(\d{2}/\d{2}/\d{4})',t):
        vig.append(('RS',m.group(2)))
    for m in re.finditer(r'Expiraci[oó]n de este Certi\S+:\s*(\d{4}/\d{2}/\d{2})',t): vig.append(('ISO',m.group(1)))
    for m in re.finditer(r'Fecha de vigencia de informe:\s*(\d{2}/\d{2}/\d{4})',t): vig.append(('NOTIF',m.group(1)))
    out=[]
    for k,v in sorted(set(vig)):
        dd=d(v); 
        out.append(f"{k} {v} {'VENCIDO' if dd and dd<today else str((dd-today).days)+'d' if dd else '?'}")
    print(f"{f[:70]} | {','.join(regs[:4])} | {'; '.join(out) if out else '—'}")
