"""WebKitGTK smoke: run after starting the visual-review-smoke Rust example
and Vite on localhost:1437. Requires python3-gi, GTK3 and WebKit2 4.1.
Optionally set PRISM_SMOKE_PERFORMANCE=1 and give the backend
PRISM_SMOKE_LARGE_PDF / PRISM_SMOKE_LONG_PDF paths to disposable build outputs.
"""
import os
import gi,json,sys,time
gi.require_version('Gtk','3.0');gi.require_version('WebKit2','4.1')
from gi.repository import Gtk,WebKit2,GLib
window=Gtk.Window();window.set_default_size(1200,850)
view=WebKit2.WebView();window.add(view);window.show_all()
view.get_settings().set_enable_developer_extras(True)
stage=0;deadline=time.time()+120;busy=False
def evaluate(script, callback):
 def done(view,result,_):
  global busy
  try: value=view.evaluate_javascript_finish(result);callback(value.to_json(0))
  except Exception as e: print('EVAL ERROR',e,flush=True);Gtk.main_quit()
  busy=False
 view.evaluate_javascript(script,-1,None,None,None,done,None)
def tick():
 global stage,busy
 if time.time()>deadline:
  evaluate('document.body.innerText',lambda v:print('TIMEOUT',v,flush=True));GLib.timeout_add(1000,lambda:Gtk.main_quit());return False
 if busy:return True
 busy=True
 if stage==0:
  def ready(value):
   global stage
   if value=='true':print('baseline displayed',flush=True);stage=1
  evaluate("Boolean(window.smoke && document.querySelector('.mupdf-text-layer'))",ready)
 elif stage==1:
  evaluate('window.smoke.edit().then(()=>window.edited=true).catch(e=>window.smokeError=String(e)); true',lambda v:None);stage=2
 elif stage==2:
  def report(value):
   global stage
   data=json.loads(value)
   if data['ready'] and data['autoCompiled']:
    assert 'Original passage' in data['text'] and 'Updated passage' in data['text'],data
    print('report ready, PDF excerpts and highlights present; Auto compiled pending agent edits',flush=True);stage=3
  evaluate("({ready:!!document.querySelector('[aria-label=\"Visual changes\"] article')&&!!document.querySelector('[aria-label^=\"Change 1:\"]'),autoCompiled:window.smoke.autoCompiledPendingReview(),text:document.body.innerText,error:window.smokeError})",report)
 elif stage==3:
  evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Show rendered crops')).click();true",lambda v:None);stage=4
 elif stage==4:
  evaluate("document.querySelector('[aria-label=\"Visual changes\"] details').open=true;true",lambda v:None);stage=5
 elif stage==5:
  def cropped(value):
   global stage
   if value=='true':print('lazy rendered crop loaded',flush=True);stage=6
  evaluate("Boolean(document.querySelector('[aria-label=\"Visual changes\"] img')?.naturalWidth)",cropped)
 elif stage==6:
  evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Undo all changes in this file').click();true",lambda v:None);stage=7
 elif stage==7:
  evaluate("window.smoke.read().then(r=>window.undoText=new TextDecoder().decode(new Uint8Array(r.bytes)));true",lambda v:None);stage=8
 elif stage==8:
  def undone(value):
   global stage
   data=json.loads(value)
   if data.get('text') and 'Original passage' in data['text'] and not data['cards'] and not data['compiling']:
    print('file undo restored original bytes and removed report',flush=True);stage=9
    if not os.environ.get('PRISM_SMOKE_PERFORMANCE'):Gtk.main_quit()
  evaluate("({text:window.undoText,compiling:window.smoke.compiling(),cards:!!document.querySelector('[aria-label=\"Visual changes\"] article')})",undone)
 elif stage==9:
  evaluate("window.smoke.performance().then(m=>window.perfMetrics=m).catch(e=>window.perfError=String(e));true",lambda v:None);stage=10
 elif stage==10:
  def performance(value):
   global stage
   result=json.loads(value)
   assert not result.get('error'),result
   if result.get('metrics'):
    assert result['metrics'][0]['pages']>=21,result
    assert result['metrics'][1]['pages']>21,result
    print('WebKit repeated render metrics',json.dumps(result['metrics']),flush=True);stage=11;Gtk.main_quit()
  evaluate("({metrics:window.perfMetrics,error:window.perfError})",performance)
 return True
view.load_uri('http://127.0.0.1:1437/scripts/visual-review-smoke/index.html')
GLib.timeout_add(500,tick);Gtk.main();sys.exit(0 if stage in (9,11) else 1)
