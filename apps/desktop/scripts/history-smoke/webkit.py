"""Run with PRISM_SMOKE_HISTORY=1 visual-review-smoke backend and Vite :1437.
Exercises the actual History/Keep UI against a disposable real Git repository.
"""
import gi, json, sys, time
gi.require_version('Gtk', '3.0'); gi.require_version('WebKit2', '4.1')
from gi.repository import Gtk, WebKit2, GLib
window = Gtk.Window(); window.set_default_size(1300, 850)
view = WebKit2.WebView(); window.add(view); window.show_all()
stage = 0; busy = False; deadline = time.time() + 120; failed = False

def evaluate(script, callback):
    def done(view, result, _):
        global busy, failed
        try:
            callback(json.loads(view.evaluate_javascript_finish(result).to_json(0)))
        except Exception as e:
            print('FAIL', e, flush=True); failed = True; Gtk.main_quit()
        busy = False
    view.evaluate_javascript(script, -1, None, None, None, done, None)

def advance(n, text):
    global stage
    print(text, flush=True); stage = n

def check(value, n, text):
    if value: advance(n, text)

def tick():
    global busy, stage, failed
    if time.time() > deadline:
        failed = True
        evaluate('document.body.innerText', lambda v: print('TIMEOUT', v, flush=True))
        GLib.timeout_add(500, Gtk.main_quit); return False
    if busy: return True
    busy = True
    if stage == 0:
        evaluate("Boolean(window.smoke?.history().length && document.querySelector('input[type=checkbox]') && !document.querySelector('input[type=checkbox]').checked)", lambda v: check(v, 1, 'Initial commit visible; prompt option defaults off'))
    elif stage == 1:
        evaluate("window.initialId=window.smoke.initial().id; window.smoke.edit().then(()=>window.edited=true).catch(e=>window.failure=String(e)); true", lambda _: advance(2, 'Agent edit submitted'))
    elif stage == 2:
        evaluate("(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Keep all changes'); if(!window.edited || !b || b.disabled)return false; window.beforeKeep=window.smoke.compilationCount(); b.click(); return true;})()", lambda v: check(v, 3, 'Keep all clicked'))
    elif stage == 3:
        evaluate("Boolean(window.smoke.history().some(s=>s.message.startsWith('docs(agent): ')) && window.smoke.compilationCount()>window.beforeKeep && !window.smoke.compiling())", lambda v: check(v, 4, 'One acceptance commit appears automatically; PDF recompiled'))
    elif stage == 4:
        evaluate("window.smoke.call('git_log').then(log=>{window.externalLog=log;return window.smoke.restart()}).then(()=>window.restarted=true).catch(e=>window.failure=String(e));true", lambda _: advance(5, 'Checking external git log and backend restart'))
    elif stage == 5:
        evaluate("Boolean(window.restarted && window.externalLog.includes('docs(agent): ') && window.smoke.history().some(s=>s.id===window.initialId))", lambda v: check(v, 6, 'External Git and recovered UI show the same history'))
    elif stage == 6:
        evaluate("(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('docs(history): initial document'));if(!b)return false;b.click();return true;})()", lambda v: check(v, 7, 'Selected initial commit without opening a source diff'))
    elif stage == 7:
        evaluate("(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Restore');if(!b||b.disabled)return false;b.click();return true;})()", lambda v: check(v, 8, 'Restore confirmation opened'))
    elif stage == 8:
        evaluate("(()=>{const b=Array.from(document.querySelectorAll('[role=dialog] button')).find(b=>b.textContent==='Restore');if(!b||b.disabled)return false;window.beforeRestore=window.smoke.compilationCount();b.click();return true;})()", lambda v: check(v, 9, 'Confirmed restore'))
    elif stage == 9:
        evaluate("window.smoke.read().then(r=>window.restoredText=new TextDecoder().decode(new Uint8Array(r.bytes)));Boolean(window.restoredText?.includes('Original passage') && window.smoke.history().some(s=>s.message.startsWith('docs(history): restore version')) && window.smoke.compilationCount()>window.beforeRestore && !window.smoke.compiling() && !document.querySelector('[role=dialog]'))", lambda v: check(v, 10, 'Original document restored; later commits retained; PDF recompiled'))
    elif stage == 10:
        def snapshot_done(view, result, _):
            try: view.get_snapshot_finish(result).write_to_png('/tmp/prism-history-smoke.png')
            except Exception as e: print('Snapshot:', e)
            Gtk.main_quit()
        view.get_snapshot(WebKit2.SnapshotRegion.VISIBLE, WebKit2.SnapshotOptions.NONE, None, snapshot_done, None)
        return False
    return True
view.load_uri('http://127.0.0.1:1437/scripts/visual-review-smoke/index.html?history=1&auto=off')
GLib.timeout_add(300, tick); Gtk.main()
sys.exit(0 if stage == 10 and not failed else 1)
