import gi, json, time, sys
gi.require_version('Gtk', '3.0'); gi.require_version('WebKit2', '4.1')
from gi.repository import Gtk, WebKit2, GLib
window=Gtk.Window();window.set_default_size(1400,900)
view=WebKit2.WebView();window.add(view);window.show_all()
deadline=time.time()+60
passed=False
stress="--stress" in sys.argv

def done(view,result,_):
    global passed
    try:
        data=json.loads(view.evaluate_javascript_finish(result).to_json(0))
        if data:
            passed=bool(data.get("pdfStress") if stress else data.get("synchronized") and data.get("undoRedo"))
            print(json.dumps(data),flush=True);Gtk.main_quit()
    except Exception as e: print(e,flush=True);Gtk.main_quit()
def tick():
    if time.time()>deadline: print('TIMEOUT',flush=True);Gtk.main_quit();return False
    view.evaluate_javascript("(()=>{if(window.typingSmoke && document.querySelector('.cm-content') && !window.started){window.started=true;setTimeout(()=>window.typingSmoke[" + ("'pdfStress'" if stress else "'run'") + "]().then(r=>window.result=r).catch(e=>window.result={error:String(e)}),1500)}return window.result||null})()",-1,None,None,None,done,None)
    return True
view.load_uri('http://127.0.0.1:1438/scripts/typing-smoke/index.html' + ('?pdf=1' if '--pdf' in sys.argv or stress else ''))
GLib.timeout_add(500,tick);Gtk.main()

sys.exit(0 if passed else 1)
