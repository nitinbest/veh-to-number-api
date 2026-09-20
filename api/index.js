import re
import time
import json
import traceback
import requests
from bs4 import BeautifulSoup
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

OWNER     = "@FizzaGirl"
DEVELOPER = "@FizzaGirl"
CHANNEL   = "@BUILDAPIS"

def brand():
    return {"Owner": OWNER, "Developer": DEVELOPER, "Channel": CHANNEL}

HOMEPAGE_URL  = "https://vahan.parivahan.gov.in/vahanservice/vahan/ui/statevalidation/homepage.xhtml?statecd=Mzc2MzM2MzAzNjY0MzIzODM3NjIzNjY0MzY2MjM3NDQ0Yw=="
HOMEPAGE_BASE = "https://vahan.parivahan.gov.in/vahanservice/vahan/ui/statevalidation/homepage.xhtml"
LOGIN_URL     = "https://vahan.parivahan.gov.in/vahanservice/vahan/ui/usermgmt/login.xhtml"
FORM_URL      = "https://vahan.parivahan.gov.in/vahanservice/vahan/ui/balanceservice/form_reschedule_fitness.xhtml"

BASE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}

AJAX_HEADERS = {
    "User-Agent": BASE_HEADERS["User-Agent"],
    "Accept": "application/xml, text/xml, */*; q=0.01",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "Faces-Request": "partial/ajax",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": "https://vahan.parivahan.gov.in",
}

def last5(ch):
    if not ch: return None
    ch = str(ch).strip()
    if ch.lower() in ("", "null", "none", "n/a"): return None
    if "~" in ch: return ch[-5:]
    c = re.sub(r"[^A-Z0-9]", "", ch.upper())
    return c[-5:] if len(c) >= 5 else None

def pick_chassis(d):
    KEYS = ("chassis_number_unmasked","chassis_number","chassis_no","chasis_no",
            "chassisNo","chassis","vehicle_chasi_number","vehicle_chassis_number")
    def search(x):
        if not isinstance(x, dict): return None
        for k in KEYS:
            v = x.get(k)
            if v and str(v).strip().lower() not in ("","null","none","n/a"):
                return str(v).strip()
        for v in x.values():
            if isinstance(v, dict):
                r = search(v)
                if r: return r
        return None
    return search(d)

def get_chassis(vnum):
    try:
        r = requests.get(f"https://api2.adv.lat/vehicle?key=Jv9sTf3bW5&number={vnum}", timeout=10)
        if r.ok:
            ch = pick_chassis(r.json())
            l5 = last5(ch)
            if l5:
                return {"ok": True, "chassis_full": ch, "last5": l5, "source": "AdvAPI"}
    except Exception as e:
        return {"ok": False, "error": f"Chassis error: {e}"}
    return {"ok": False, "error": "No chassis returned"}

def vs_html(html):
    t = BeautifulSoup(html, "html.parser").find("input", {"name": "javax.faces.ViewState"})
    return t["value"] if t else None

def vs_ajax(text):
    m = re.search(r'<update id="j_id1:javax\.faces\.ViewState:0"><!\[CDATA\[(.*?)\]\]></update>', text)
    return m.group(1) if m else None

def chk_id(html):
    m = re.search(r'id="(j_idt\d+)"[^>]*class="[^"]*ui-chkbox', html)
    return m.group(1) if m else "j_idt187"

def parivahan(vnum, l5):
    s = requests.Session()
    s.max_redirects = 10
    bh = BASE_HEADERS.copy()
    ah = AJAX_HEADERS.copy()

    r1 = s.get(HOMEPAGE_URL, headers=bh, timeout=15)
    if r1.status_code != 200:
        return {"ok": False, "error": f"Step1 HTTP {r1.status_code}", "snippet": r1.text[:300]}
    vs = vs_html(r1.text)
    chk = chk_id(r1.text)
    if not vs:
        return {"ok": False, "error": "Step1 no ViewState", "snippet": r1.text[:300]}

    ah["Referer"] = HOMEPAGE_URL
    r2 = s.post(HOMEPAGE_BASE, headers=ah, timeout=15, data={
        "javax.faces.partial.ajax":"true","javax.faces.source":"fit_c_office_to",
        "javax.faces.partial.execute":"fit_c_office_to",
        "javax.faces.behavior.event":"change","javax.faces.partial.event":"change",
        "homepageformid":"homepageformid","j_idt12":"","j_idt47_input":"en",
        "state_cd_filter":"","fit_c_office_to_input":"1","abc":"abc",
        "javax.faces.ViewState":vs,"pmtchk_input":"-1","nocregnno":"",
    })
    vs = vs_ajax(r2.text) or vs

    r3 = s.post(HOMEPAGE_BASE, headers=ah, timeout=15, data={
        "javax.faces.partial.ajax":"true","javax.faces.source":chk,
        "javax.faces.partial.execute":chk,"javax.faces.partial.render":"proccedHomeButtonId",
        "javax.faces.behavior.event":"change","javax.faces.partial.event":"change",
        "homepageformid":"homepageformid","j_idt12":"","j_idt47_input":"en",
        "state_cd_filter":"","fit_c_office_to_input":"1",f"{chk}_input":"on",
        "abc":"abc","javax.faces.ViewState":vs,"pmtchk_input":"-1","nocregnno":"",
    })
    vs = vs_ajax(r3.text) or vs

    r4 = s.post(HOMEPAGE_BASE, headers=ah, timeout=15, data={
        "javax.faces.partial.ajax":"true","javax.faces.source":"proccedHomeButtonId",
        "javax.faces.partial.execute":"@all",
        "javax.faces.partial.render":"regnid facelesslist portaldownMsgPnl mainhomepagepnl leftmenupnlid leftmenupnlidservdown",
        "proccedHomeButtonId":"proccedHomeButtonId","homepageformid":"homepageformid",
        "j_idt12":"","j_idt47_input":"en","state_cd_filter":"",
        "fit_c_office_to_input":"1",f"{chk}_input":"on","abc":"abc",
        "javax.faces.ViewState":vs,"pmtchk_input":"-1","nocregnno":"",
    })
    vs = vs_ajax(r4.text) or vs

    dm = re.search(r'id="(j_idt\d+)"[^>]*class="[^"]*ui-button', r4.text)
    dbt = dm.group(1) if dm else "j_idt536"
    r5 = s.post(HOMEPAGE_BASE, headers=ah, timeout=15, data={
        "javax.faces.partial.ajax":"true","javax.faces.source":dbt,
        "javax.faces.partial.execute":"@all",f"{dbt}":dbt,
        "homepageformid":"homepageformid","j_idt12":"","j_idt47_input":"en",
        "state_cd_filter":"","fit_c_office_to_input":"1",f"{chk}_input":"on",
        "pmtchk_input":"-1","nocregnno":"","javax.faces.ViewState":vs,
    })
    vs = vs_ajax(r5.text) or vs

    r6 = s.get(LOGIN_URL + "?faces-redirect=true",
               headers={**bh, "Referer": HOMEPAGE_URL}, timeout=15, allow_redirects=True)
    vs = vs_html(r6.text)
    if not vs:
        return {"ok": False, "error": "Step6 no ViewState", "snippet": r6.text[:300]}

    fm = re.search(r'id="(j_idt\d+)"[^>]*name="\1"[^>]*type="submit"', r6.text)
    fbt = fm.group(1) if fm else "j_idt506"
    s.post(LOGIN_URL, timeout=15, allow_redirects=True, data={
        "loginForm":"loginForm",f"{fbt}":fbt,
        "javax.faces.ViewState":vs,"InputEnter":"",
        "fitbalcTest":"fitbalcTest","pur_cd":"86",
    }, headers={**bh, "Content-Type":"application/x-www-form-urlencoded",
                "Origin":"https://vahan.parivahan.gov.in",
                "Referer":LOGIN_URL + "?faces-redirect=true"})

    r8 = s.get(FORM_URL, timeout=15,
               headers={**bh, "Referer": LOGIN_URL + "?faces-redirect=true"})
    vs = vs_html(r8.text)
    if not vs:
        return {"ok": False, "error": "Step8 no ViewState", "snippet": r8.text[:300]}

    ah["Referer"] = FORM_URL
    r9 = s.post(FORM_URL, headers=ah, timeout=15, data={
        "javax.faces.partial.ajax":"true",
        "javax.faces.source":"balanceFeesFine:validate_dtls",
        "javax.faces.partial.execute":"@all",
        "javax.faces.partial.render":"balanceFeesFine:auth_panel",
        "balanceFeesFine:validate_dtls":"balanceFeesFine:validate_dtls",
        "balanceFeesFine":"balanceFeesFine",
        "balanceFeesFine:tf_reg_no":vnum,
        "balanceFeesFine:tf_chasis_no":l5,
        "javax.faces.ViewState":vs,
    })

    body = r9.text
    for pat in [
        r'id="balanceFeesFine:tf_mobile"[^>]*value="(\d{10})"',
        r'value="(\d{10})"[^>]*id="balanceFeesFine:tf_mobile"',
        r'balanceFeesFine:tf_mobile[^>]*value="(\d{10})"',
    ]:
        m = re.search(pat, body, re.DOTALL)
        if m and m.group(1)[0] in "6789":
            return {"ok": True, "mobile": m.group(1)}

    hits = re.findall(r"\b([6-9]\d{9})\b", body)
    if hits:
        return {"ok": True, "mobile": hits[0]}

    return {"ok": False, "error": "Mobile not found", "snippet": body[:500]}

def lookup(raw):
    vnum = re.sub(r"[^A-Z0-9]", "", raw.upper())
    if len(vnum) < 6:
        return {"success": False, "error": "Vehicle number too short", "input": raw, **brand()}

    cr = get_chassis(vnum)
    if not cr["ok"]:
        return {"success": False, "vehicle": vnum, "error": cr["error"], **brand()}

    err = {}
    for i in range(1, 3):
        try:
            mr = parivahan(vnum, cr["last5"])
            if mr["ok"]:
                return {
                    "success": True,
                    "vehicle": vnum,
                    "mobile": mr["mobile"],
                    "chassis_last5": cr["last5"],
                    "chassis_full": cr["chassis_full"],
                    "chassis_source": cr["source"],
                    **brand()
                }
            err = mr
        except Exception as e:
            err = {"error": str(e), "type": type(e).__name__}
            time.sleep(1)
            continue

    return {
        "success": False,
        "vehicle": vnum,
        "error": err.get("error", "Unknown"),
        "detail": err.get("type", ""),
        "snippet": err.get("snippet", ""),
        "chassis_last5": cr["last5"],
        **brand()
    }

class handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            qs = parse_qs(parsed.query)
            parts = [p for p in parsed.path.split("/") if p]

            if not parts or parts == ["api"]:
                return self._send(200, {
                    "status": "ok",
                    "name": "Parivahan Mobile Lookup API",
                    "usage": "/api?rc=MH12DE1433",
                    **brand()
                })

            reg = None
            if "rc" in qs:
                reg = qs["rc"][0]
            elif len(parts) >= 2:
                reg = parts[-1]

            if not reg:
                return self._send(400, {
                    "success": False,
                    "error": "Pass ?rc=MH12DE1433",
                    **brand()
                })

            res = lookup(reg)
            return self._send(200 if res["success"] else 422, res)
        except Exception as e:
            return self._send(500, {
                "success": False,
                "error": str(e),
                "traceback": traceback.format_exc()[:1000],
                **brand()
            })

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
