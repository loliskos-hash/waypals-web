# Erzeugt page-export.html aus index.html (fuer Sprite-Rendering mit tools/gensprites.mjs)
# Aufruf: python3 tools/make-export-page.py   (im Repo-Ordner)
a=open('index.html').read()
a=a.replace("function p3Apply(el){","window.__p3Make=function(s,f,cb){p3Make(s,f,cb)};window.__DEXC=DEX_C;window.__SPEC3=SPEC3;window.__P3N=[P3PN,P3PW,P3PH];P3SS=2;function p3Apply(el){",1)
# lokal ohne Google-Fonts-Abruf, Sprites sollen frisch per Shader entstehen
open('page-export.html','w').write(a)
print('page-export.html geschrieben')
