
export default {
  async fetch(request, env, ctx) {
    if (!env.AdminName || !env.AdminPass) return new Response("请在设置中添加变量 AdminName 与 密钥 AdminPass 。");
    if (env.FAKV == null) return new Response(
      htmlbody("Error", '请在Workers的设置中将 变量名称 FAKV 绑到目标KV命名空间。'),
      htmlhead(500)
    );
    const url = new URL(request.url);
    let s = "Not Valid.";
    let cookies = request.headers.get("cookie");
    let cookie_user = "";
    let validuser = false;
    if (cookies) cookies.split("; ").forEach(c => {
      if (c.substring(0, 5) == "user=") cookie_user = c.substring(5);
    });
    if (cookie_user.length > 0) validuser = await checkcookie(cookie_user, env);
    if (url.pathname == "/") {
      if (!validuser) return loginpage();
      if (request.method == "GET") {
        return await listpage(env.FAKV);
      }
      if (request.method == "POST") {
        let data = Object.fromEntries(await request.formData());
        if (data.label) {
          await editlabel(env.FAKV, data.label, data.name);
          return backpage(200, "成功");
        } else {
          return backpage();
        }
      }
    }
    if (url.pathname == "/login") {//&& url.searchParams.get('secret')
      if (request.method == "POST") {
        //await request.json() await request.text() await request.formData();
        let data = Object.fromEntries(await request.formData());
        if (data.name == env.AdminName && data.pass == env.AdminPass) {
          return await loginsucces(data.name, data.pass);
        }
      }
      return loginpage();
    }
    if (url.pathname == "/add") {
      if (!validuser) return backpage();
      if (request.method == "GET") {
        return addpage();
      }
    }
    if (url.pathname == "/check") {
      if (!validuser) return backpage();
      try {
        let tmp = await request.json();
        if (tmp["s"]) {
          let totp = new URL(tmp["s"]);
          let secret = totp.searchParams.get('secret');
          if (secret) {
            let res = await generateTOTP(secret);
            await saveOTP(env.FAKV, tmp["s"]);
            return new Response(res, htmlhead());
          } else {
            return new Response("no secret", htmlhead());
          }
        } else {
          return new Response("no otp", htmlhead());
        }
      } catch (error) {
        return new Response(error + " " + request.text(), htmlhead(400));
      }
    }
    if (url.pathname == "/del") {
      if (!validuser) return backpage();
      if (request.method == "POST") {
        let data = Object.fromEntries(await request.formData());
        if (data.label) {
          let r = await delOTP(env.FAKV, data.label);
          if (!r) return backpage(200, "成功");
          else return backpage();
        }
      }
    }
    return new Response(htmlbody("", s), htmlhead(400));
  }
}
function htmlhead(stat, head) {
  if (!stat) stat = 200;
  else stat *= 1;
  if (!head) head = new Object();
  if (!head['Content-Type']) head['Content-Type'] = 'text/html';
  return {
    status: stat,
    headers: head,
  };
}
function htmlbody(title, body) {
  let html = `
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1"></meta>
<title>` + title + `</title>
<body>
` + body + `
</body>`;
  return html;
}
function loginpage() {
  let title = "登录";
  let html = `
  <form method="POST">
  名<input name="name" autofocus><br>
  密<input name="pass" type="password"><br>
  <button>确认</button>
  </form>
  `;
  return new Response(htmlbody(title, html), htmlhead(401));
}
function backpage(stat, msg) {
  if (!stat) stat = 400;
  if (msg == null) msg = "出错";
  let s = `<meta http-equiv="refresh" content="3;URL=/">` + msg;
  return new Response(htmlbody(msg, s), htmlhead(stat));
}

async function md5(str) {
  let msgUint8 = new TextEncoder().encode(str) // encode as (utf-8) Uint8Array
  let hashBuffer = await crypto.subtle.digest('MD5', msgUint8) // hash the message
  let hashArray = Array.from(new Uint8Array(hashBuffer)) // convert buffer to byte array
  let hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex;
}
async function loginsucces(name, pass) {
  let s = `<meta http-equiv="refresh" content="3;URL=/">登录成功`;
  let t = Date.now();
  let h = new Object();
  h['Set-Cookie'] = "user=" + (await md5(name + ":" + pass + "@" + t)) + "@" + t;
  return new Response(htmlbody("成功", s), htmlhead(200, h));
}
async function checkcookie(cookie, env) {
  let a = cookie.split("@");
  if (Date.now() - a[1] > 30 * 60 * 1000) return false;
  let c = await md5(env.AdminName + ":" + env.AdminPass + "@" + a[1]);
  if (a[0] == c) return true;
  return false;
}
function addpage() {
  let s = `<script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>
<style>
    #reader {
        width: 100%;
        max-width: 400px;
        margin: 20px auto;
    }

    #result {
        display: none;
    }

    #code {
        text-align: center;
        font-size: 28px;
        padding: 10px;
    }

    body:has(span[id="code"]:empty) a[back] {
        display: none;
    }

    body:has(span[id="code"]:not(:empty)) a[back] {
        display: block;
    }
</style>
<button onclick="start();">点击开始添加</button>
<div id="reader"></div>
<div>
    <span id="countdown"></span>
    <span id="result"></span>
    <span id="code"></span>
</div>
<a back href="/">在目标网站输入验证码确认成功后按这里返回</a>
<div id="error"></div>

<script>
    var html5QrcodeScanner;
    var scaning = false;
    var countdown = setInterval(() => {
        let t = 30 - Math.floor(Date.now() / 1000) % 30;
        if (document.getElementById("code").textContent != "") document.getElementById("countdown").innerHTML = t;
        else document.getElementById("countdown").innerHTML = "";
        if (t == 30) {
            //clearInterval(countdown);
            refresh();
        }
    }, 1000);
    // 扫码成功回调
    function onScanSuccess(decodedText, decodedResult) {
        if (scaning) return;
        scaning = true;
        html5QrcodeScanner.clear();
        // 如果是链接直接跳转：location.href = decodedText;
        if (/^otpauth?:\\/\\//.test(decodedText)) {
            let totp = new URL(decodedText);
            let secret = totp.searchParams.get('secret');
            if (secret) {
                document.getElementById('result').innerText = decodedText;
                refresh();
                scaning = false;
            }
        }
        if (scaning) document.getElementById("error").innerHTML = "似乎不是TOTP二维码";
    }
    // 扫码失败（持续扫描中会频繁触发，一般只打印）
    function onScanFailure(error) {
        // console.warn(error);
    }
    // 刷新用
    function refresh() {
        let totp = document.getElementById("result").textContent;
        if (totp == "") return;
        fetch("/check", {
            method: "POST",
            headers: { "Content-Type": "application/json", },
            body: JSON.stringify({ "s": totp, }),
        }).then(res => {
            if (!res.ok) {
                res.text().then(t => {
                    document.getElementById("error").innerHTML = res.status + t;
                });
                return "";
            } else {
                return res.text();
            }
        }).then(code => {
            document.getElementById("code").textContent = code;
        }).catch(error => {
            document.getElementById("error").innerHTML = error;
        });
    }

    function start() {
        scaning = false;
        document.getElementById('result').innerHTML = "";
        document.getElementById('code').innerHTML = "";
        document.getElementById("error").innerHTML = "";
        html5QrcodeScanner = new Html5QrcodeScanner(
            "reader",
            {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                rememberLastUsedCamera: true
            },
            false
        );
        html5QrcodeScanner.render(onScanSuccess, onScanFailure);
    }
</script>
  `;
  return new Response(htmlbody("", s), htmlhead());
}
async function getKVdata(kv) {
  let arr = [];
  let list1 = await kv.get("TOTPList");
  if (list1) {
    let list = JSON.parse(list1);
    for (let i = 0; i < list.length; i++) {
      let label = list[i];
      let t1 = await kv.get(label);
      if (t1) {
        let t = JSON.parse(t1);
        let totp = new URL(t.totp);
        let secret = totp.searchParams.get('secret');
        let name = t.name;
        if (!name) name = totp.pathname.substring(1);
        if (secret) {
          let code = await generateTOTP(secret);
          let tmp = new Object();
          tmp["label"] = label;
          tmp["name"] = name;
          tmp["code"] = code;
          arr.push(tmp);
        }
      }
    }
  }
  return arr;
}
async function listpage(kv) {
  let s = `<style>
  #ctn {
    margin: 1em;
  }

  .code {
    font-size: 28px;
  }

  .progress-circle {
    --percent: 30;
    /* 百分数 */
    --size: 20px;
    /* 尺寸大小 */
    --border-width: 10px;
    /* 环宽（粗细） */
    --color: #7856d7;
    /* 主色 */
    --inactive-color: #ccc;
    /* 辅助色 */

    position: relative;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    display: inline-block;
  }

  /* 百分数文本 */
  .progress-circle::before {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    counter-reset: progress round(down, var(--percent));
    content: counter(progress);
    white-space: nowrap;
    font-size: 12px;
  }

  /* SVG 容器 */
  .progress-circle>svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  /* 进度条圆环 */
  .progress-circle circle {
    --r: calc((var(--size) - var(--border-width)) / 2);
    cx: calc(var(--size) / 2);
    cy: calc(var(--size) / 2);
    r: var(--r);
    fill: none;
    stroke-width: var(--border-width);
    stroke-linecap: butt;
    transition: stroke-dasharray .4s linear, stroke .3s;
  }

  /* 优化：进度为0时隐藏进度条 */
  .progress-value {
    opacity: var(--percent);
  }

  .mask {
    position: fixed;
    z-index: 900;
    left: 0px;
    top: 0px;
    background-color: rgba(48, 48, 48, 0.5);
  }

  .toast {
    position: fixed;
    z-index: 999;
    color: #fff;
    background-color: #777;
    text-align: left;
    border-radius: 8px;
    padding: 12px 20px;
    max-width: 80vw;
    word-break: break-word;
    white-space: normal;
  }
</style>
<a href="/add">添加</a><br>
<div id="ctn"></div>
<div id="model" style="display: none;">
  <div class="progress-circle">
    <svg>
      <circle stroke="var(--inactive-color)" />
      <circle stroke="var(--color)" class="progress-value" style="stroke-dasharray: calc(2 * PI * var(--r) * (var(--percent) / 30)), 1000" />
    </svg>
  </div>
</div>
<script>
  const timestramp = ` + Date.now() / 1000 + `;
  const codes = ` + JSON.stringify(await getKVdata(kv)) + `;
  const containor = document.getElementById("ctn");
  const progressmodel = document.getElementById("model").children[0];
  function changeDemo(value, property, unit = '') {
    document.querySelectorAll('.progress-circle').forEach(p => {
      p.style.setProperty(property, value + unit);
    });
  }
  var CountDown;
  countdown();
  function countdown(stop) {
    if (stop) {
      clearTimeout(CountDown);
    } else {
      CountDown = setTimeout(() => {
        let t = 300 - Math.floor(Date.now() / 100) % 300;
        changeDemo(t / 10, '--percent');
        //document.querySelectorAll(".countdown").forEach(c => {
        //  c.textContent = t;
        //});
        if (Date.now() / 1000 - timestramp > 30 || t > 297 || timestramp % 30 > 29.5) {
          document.querySelectorAll(".code").forEach(c => {
            c.textContent = "";
          });
          setTimeout(() => {
            location.reload(true);
          }, 300);
          countdown(1);
        } else {
          countdown();
        }
      }, 100);
    }
  }
  codes.forEach(code => {
    let d = document.createElement("div");
    containor.appendChild(d);
    let n = document.createElement("div");
    n.id = code["label"];
    n.textContent = code["name"];
    n.title = "修改名称";
    n.setAttribute("onclick", "editname(this);");
    n.appendChild(makeGearSVG());
    d.appendChild(n);
    let d1 = document.createElement("div");
    d.appendChild(d1);
    let c1 = document.createElement("span");
    //c1.className = "countdown";
    c1.appendChild(makeDelSVG());
    c1.title = "删除";
    c1.setAttribute("onclick", "delConfirm('" + code["label"] + "', '" + code["name"] + "');");
    d1.appendChild(c1);
    d1.appendChild(progressmodel.cloneNode(true));
    let c = document.createElement("span");
    c.className = "code";
    c.textContent = code["code"];
    d1.appendChild(c);
  });
  function editname(btn) {
    countdown(1);
    const mask = document.createElement("div");
    mask.className = "mask";
    document.body.appendChild(mask);
    mask.style.width = document.documentElement.scrollWidth < window.innerWidth ? window.innerWidth : document.documentElement.scrollWidth + 'px';
    mask.style.height = document.documentElement.scrollHeight < window.innerHeight ? window.innerHeight : document.documentElement.scrollHeight + 'px';

    const toast = document.createElement("form");
    toast.className = "toast";
    toast.method = "POST";
    mask.appendChild(toast);
    toast.appendChild(document.createTextNode("重命名"));
    toast.appendChild(document.createElement("br"));
    let id = document.createElement("input");
    id.name = "label";
    id.type = "hidden";
    id.value = btn.id;
    toast.appendChild(id);
    let name = document.createElement("input");
    name.name = "name";
    name.setAttribute("autofocus", "");
    name.value = btn.innerText;
    toast.appendChild(name);
    let b = document.createElement("button");
    b.textContent = "提交";
    toast.appendChild(b);
    toast.style.top = "50vh";
    toast.style.top = toast.offsetTop - toast.offsetHeight / 2;
    toast.style.left = (document.documentElement.clientWidth - toast.offsetWidth) / 2;

    mask.addEventListener("click", e => {
      if (toast.contains(e.target)) return;
      mask.remove();
      countdown();
    });
  }
  function makeDelSVG() {
    let svgNS = "http://www.w3.org/2000/svg";
    let svg1 = document.createElementNS(svgNS, "svg");
    svg1.setAttribute("viewBox", "0 0 1024 1024");
    svg1.setAttribute("style", "width: 1.2em; height: 1.2em; vertical-align: middle; fill: currentColor; overflow: hidden;");
    let path1 = document.createElementNS(svgNS, "path");
    svg1.appendChild(path1);
    path1.setAttribute("d", "M202.666667 256h-42.666667a32 32 0 0 1 0-64h704a32 32 0 0 1 0 64H266.666667v565.333333a53.333333 53.333333 0 0 0 53.333333 53.333334h384a53.333333 53.333333 0 0 0 53.333333-53.333334V352a32 32 0 0 1 64 0v469.333333c0 64.8-52.533333 117.333333-117.333333 117.333334H320c-64.8 0-117.333333-52.533333-117.333333-117.333334V256z m224-106.666667a32 32 0 0 1 0-64h170.666666a32 32 0 0 1 0 64H426.666667z m-32 288a32 32 0 0 1 64 0v256a32 32 0 0 1-64 0V437.333333z m170.666666 0a32 32 0 0 1 64 0v256a32 32 0 0 1-64 0V437.333333z");
    path1.setAttribute("fill", "red");
    return svg1;
  }
  function makeGearSVG() {
    let svgNS = "http://www.w3.org/2000/svg";
    let svg1 = document.createElementNS(svgNS, "svg");
    svg1.setAttribute("viewBox", "0 0 1024 1024");
    svg1.setAttribute("style", "width: 1.2em; height: 1.2em; vertical-align: middle; fill: currentColor; overflow: hidden;");
    let path1 = document.createElementNS(svgNS, "path");
    svg1.appendChild(path1);
    path1.setAttribute("d", "M70.413465 401.901008c25.653859 0.538589 51.10929-5.867789 73.503266-18.482118 21.571919-12.132433 40.280811-30.047614 53.547116-53.036873h0.028347c13.266305-22.989259 19.417562-48.132876 19.16244-72.907983-0.283468-25.625512-7.45521-50.825822-20.749862-72.794597-5.555974-9.156018-7.313476-19.530949-5.58432-29.253903 1.729155-9.807995 6.916621-18.99236 15.250581-25.682205 19.360868-15.534049 39.912302-29.622412 61.455874-42.095007 21.430185-12.387554 43.824161-23.187687 67.011848-32.230317h0.085041c9.921382-3.855166 20.438047-3.770125 29.792492-0.368509 9.382793 3.401617 17.546673 10.11981 22.677445 19.445909 12.359207 22.53571 30.61455 41.357989 52.668364 54.425866 21.260104 12.585982 46.120252 19.814417 72.737903 19.814417s51.477799-7.228435 72.737903-19.814417c22.053815-13.067877 40.309157-31.890156 52.668364-54.425866 5.130772-9.326099 13.294652-16.044292 22.677445-19.445909 9.354446-3.401617 19.899457-3.486657 29.792492 0.368509h0.085041c23.187687 9.042631 45.581663 19.842764 67.011848 32.230317 21.571919 12.472594 42.095006 26.560957 61.455874 42.095007 8.333961 6.689846 13.521426 15.874211 15.250581 25.682205 1.729155 9.722954-0.028347 20.097885-5.58432 29.253903-13.294652 21.968774-20.466394 47.169084-20.749862 72.794597-0.255121 24.746761 5.896136 49.890378 19.190787 72.907983v0.085041c13.237958 22.904219 31.918503 40.791053 53.518769 52.951832 22.45067 12.614328 47.877754 19.020706 73.531613 18.482118 10.630052-0.226774 20.49474 3.486657 28.120031 9.921382 7.710331 6.463072 13.067877 15.562396 14.655299 26.079061 1.842542 12.019046 3.231536 24.321559 4.16698 36.879193 0.963791 12.500941 1.445687 24.916842 1.445687 37.219356s-0.481896 24.746761-1.445687 37.247702c-0.935445 12.529288-2.324438 24.831802-4.16698 36.879194-1.587421 10.488318-6.944967 19.587643-14.655299 26.079061-7.625291 6.406378-17.489979 10.11981-28.120031 9.893035-25.653859-0.538589-51.080943 5.896136-73.531613 18.510464-21.600266 12.16078-40.280811 30.047614-53.518769 52.951833-13.294652 23.017606-19.445909 48.189569-19.190787 72.993024 0.283468 25.625512 7.45521 50.825822 20.749862 72.76625 5.555974 9.184365 7.313476 19.559296 5.58432 29.28225-1.729155 9.807995-6.916621 18.99236-15.250581 25.653858-19.360868 15.534049-39.912302 29.622412-61.455874 42.095007-21.430185 12.415901-43.824161 23.187687-67.011848 32.258664h-0.085041c-9.893035 3.855166-20.438047 3.741778-29.792492 0.368509-9.382793-3.429963-17.546673-10.11981-22.677445-19.445909-12.359207-22.53571-30.61455-41.386336-52.668364-54.425866-21.260104-12.614328-46.120252-19.842764-72.737903-19.842764s-51.477799 7.228435-72.737903 19.842764c-22.053815 13.039531-40.309157 31.890156-52.668364 54.425866-5.130772 9.326099-13.294652 16.015945-22.677445 19.445909-9.382793 3.401617-19.956151 3.486657-29.877533-0.368509l0.028347-0.028347c-23.357768-9.099325-45.723397-19.899457-67.011848-32.201971-21.571919-12.472594-42.123353-26.560957-61.484221-42.123353-8.333961-6.661499-13.521426-15.845864-15.250581-25.653858-1.729155-9.722954 0.028347-20.097885 5.58432-29.28225 13.294652-21.940427 20.466394-47.140737 20.749862-72.76625 0.255121-24.803455-5.896136-49.975418-19.190787-72.993024-13.209611-22.904219-31.918503-40.791053-53.518769-52.951833-22.422323-12.614328-47.877754-19.049053-73.531613-18.482117-10.630052 0.226774-20.49474-3.515004-28.120031-9.921382-7.681984-6.491418-13.067877-15.590743-14.655299-26.079061-1.842542-12.047392-3.231536-24.349906-4.16698-36.879194-0.935445-12.500941-1.41734-24.945189-1.41734-37.247702s0.481896-24.690068 1.41734-37.191009c0.935445-12.557635 2.324438-24.860148 4.16698-36.90754 1.587421-10.516665 6.973314-19.615989 14.655299-26.079061 7.653637-6.434725 17.489979-10.148156 28.120031-9.921382z m94.536596 19.020706c-28.800354 16.214373-61.625955 24.49164-94.848411 23.86801-1.672462 11.055254-2.919721 22.138855-3.741778 33.222456-0.822057 10.998561-1.247259 22.337283-1.24726 33.98782 0 11.678884 0.396855 23.017606 1.24726 34.044513 0.822057 11.083601 2.069317 22.138855 3.741778 33.165763 33.222456-0.595283 66.048057 7.681984 94.848411 23.896357 28.034991 15.760824 52.35655 39.090245 69.676448 69.081165 17.263205 29.877533 25.257004 62.5614 24.916842 94.706677-0.368508 33.137416-9.58122 65.736242-26.702691 94.196434 17.518326 14.031669 36.142177 26.787731 55.729819 38.126453 19.417562 11.225335 39.657181 21.004983 60.605471 29.168863 16.044292-29.055476 39.685528-53.377035 68.23076-70.300077 27.751523-16.441147 60.095228-25.880633 94.59329-25.880634s66.841767 9.439486 94.621637 25.880634c28.516886 16.923043 52.158122 41.216255 68.202413 70.27173 21.090023-8.24892 41.329642-18.000221 60.605471-29.168862 19.587643-11.310375 38.211494-24.066438 55.729819-38.098107-17.12147-28.460193-26.334182-61.059019-26.702691-94.196434-0.340162-32.145277 7.653637-64.829144 24.916842-94.706677 17.319898-29.99092 41.641457-53.320341 69.676448-69.081165 28.800354-16.214373 61.625955-24.49164 94.848411-23.896357 1.672462-11.026907 2.919721-22.110508 3.741778-33.165763 0.850404-11.026907 1.275606-22.365629 1.275607-34.044513 0-11.650537-0.425202-23.017606-1.275607-34.016167-0.822057-11.083601-2.069317-22.138855-3.741778-33.194109-33.222456 0.62363-66.048057-7.653637-94.848411-23.86801-28.006644-15.760824-52.328203-39.090245-69.648101-69.052818l-0.028347 0.028347c-17.263205-29.877533-25.257004-62.5614-24.916842-94.763371 0.368508-33.165762 9.58122-65.764589 26.702691-94.196434-17.518326-14.031669-36.142177-26.787731-55.729819-38.126454-19.275828-11.140295-39.515447-20.919942-60.605471-29.168862-16.044292 29.055476-39.685528 53.377035-68.202413 70.27173-27.779869 16.441147-60.123574 25.880633-94.621637 25.880634s-66.841767-9.439486-94.621637-25.880634c-28.516886-16.894696-52.158122-41.216255-68.202413-70.27173-21.090023 8.24892-41.329642 18.028568-60.605471 29.168862-19.587643 11.338722-38.211494 24.094785-55.729819 38.126454 17.12147 28.431846 26.334182 61.030672 26.702691 94.196434 0.340162 32.145277-7.653637 64.800797-24.916842 94.67833v0.085041c-17.263205 29.90588-41.584764 53.206954-69.676448 69.024471z m347.049939-77.500166c46.545455 0 88.697154 18.878972 119.198317 49.380135 30.529509 30.501163 49.380135 72.652862 49.380135 119.198317 0 46.573801-18.850626 88.697154-49.380135 119.226664-30.501163 30.501163-72.652862 49.380135-119.198317 49.380135s-88.697154-18.878972-119.198317-49.380135c-30.529509-30.529509-49.380135-72.652862-49.380135-119.226664 0-46.545455 18.850626-88.697154 49.380135-119.198317 30.501163-30.501163 72.652862-49.380135 119.198317-49.380135z m88.782195 79.824604c-22.734138-22.734138-54.114052-36.765807-88.782195-36.765807s-66.048057 14.031669-88.782195 36.765807c-22.705791 22.705791-36.765807 54.085705-36.765806 88.753848s14.060016 66.048057 36.765806 88.782195c22.734138 22.705791 54.114052 36.765807 88.782195 36.765806s66.048057-14.060016 88.753848-36.765806c22.734138-22.734138 36.794153-54.114052 36.794153-88.782195s-14.060016-66.048057-36.765806-88.753848z");
    return svg1;
  }
  function delConfirm(label, name) {
    countdown(1);
    const mask = document.createElement("div");
    mask.className = "mask";
    document.body.appendChild(mask);
    mask.style.width = document.documentElement.scrollWidth < window.innerWidth ? window.innerWidth : document.documentElement.scrollWidth + 'px';
    mask.style.height = document.documentElement.scrollHeight < window.innerHeight ? window.innerHeight : document.documentElement.scrollHeight + 'px';

    const toast = document.createElement("form");
    toast.className = "toast";
    toast.method = "POST";
    toast.action = "/del";
    toast.setAttribute("onsubmit", "return window.confirm('确认删除？');");
    mask.appendChild(toast);
    toast.appendChild(document.createTextNode("即将删除：" + name));
    toast.appendChild(document.createElement("br"));
    let id = document.createElement("input");
    id.name = "label";
    id.type = "hidden";
    id.value = label;
    toast.appendChild(id);
    toast.appendChild(document.createTextNode("请在删除前确认相关网站已经清除或更换本条2FA，"));
    toast.appendChild(document.createElement("br"));
    toast.appendChild(document.createTextNode("不然你将无法登录相关网站了。"));
    toast.appendChild(document.createElement("br"));
    let b = document.createElement("button");
    b.textContent = "删除";
    toast.appendChild(b);
    toast.style.top = "50vh";
    toast.style.top = toast.offsetTop - toast.offsetHeight / 2;
    toast.style.left = (document.documentElement.clientWidth - toast.offsetWidth) / 2;

    mask.addEventListener("click", e => {
      if (toast.contains(e.target)) return;
      mask.remove();
      countdown();
    });

  }
</script>
`;
  return new Response(htmlbody("列表", s), htmlhead());
}
async function editlabel(kv, label, name) {
  let tmp = await kv.get(label);
  if (!tmp) return false;
  let tmp1 = JSON.parse(tmp);
  tmp1["name"] = name;
  await kv.put(label, JSON.stringify(tmp1));
  return true;
}
async function saveOTP(kv, totp) {
  let exist = false;
  let list = await kv.get("TOTPList");
  let list1 = new Array();
  if (list) {
    list1 = JSON.parse(list);
    for (let i = 0; i < list1.length; i++) {
      let label = list1[i];
      let t = await kv.get(label);
      if (t) {
        t = JSON.parse(t);
        if (totp === t["totp"]) exist = true;
      }
    }
  }
  if (exist) return;
  let label = Date.now();
  list1.push(label);
  let t = new Object();
  t["totp"] = totp;
  await kv.put("TOTPList", JSON.stringify(list1));
  await kv.put(label, JSON.stringify(t));
}
async function delOTP(kv, label) {
  label = label * 1;
  let list = await kv.get("TOTPList");
  if (list) {
    let list1 = JSON.parse(list);
    let i = list1.indexOf(label);
    if (i > -1) {
      list1.splice(i, 1);
      await kv.delete(label);
      await kv.put("TOTPList", JSON.stringify(list1));
      return 0;
    }
  }
  return 1;
}

//----------------------------------------------------------------
/**
 * Base32 解码函数 (将 Base32 密钥转换为字节数组)
 */
function base32ToBytes(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const output = [];

  for (let i = 0; i < base32.length; i++) {
    const char = base32[i].toUpperCase();
    if (char === '=') break; // 忽略填充字符

    const index = alphabet.indexOf(char);
    if (index === -1) throw new Error('无效的 Base32 字符: ' + char);

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

/**
 * 生成 TOTP 动态验证码
 * @param {string} secretBase32 - Base32 编码的共享密钥 (例如: "JBSWY3DPEHPK3PXP")
 * @param {number} period - 时间步长，默认 30 秒
 * @param {number} digits - 验证码位数，默认 6 位
 * @returns {Promise<string>} 动态验证码
 */
async function generateTOTP(secretBase32, period = 30, digits = 6) {
  // 1. 获取时间计数器 (当前时间戳 / 1000 / 步长)
  const counter = Math.floor(Date.now() / 1000 / period);

  // 2. 将计数器转换为 8 字节的大端 ArrayBuffer
  const msgBuffer = new ArrayBuffer(8);
  const view = new DataView(msgBuffer);
  // 计数器通常不超过 32 位，所以高 4 字节为 0，低 4 字节设置计数器值
  view.setUint32(0, 0);
  view.setUint32(4, counter);

  // 3. 解码 Base32 密钥
  const keyBytes = base32ToBytes(secretBase32);

  // 4. 使用 Web Crypto API 进行 HMAC-SHA1 计算
  // 导入密钥
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: { name: 'SHA-1' } },
    false,
    ['sign']
  );

  // 生成签名
  const hmacBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgBuffer);
  const hmacBytes = new Uint8Array(hmacBuffer);

  // 5. 动态截取 (Dynamic Truncation)
  // 取最后一个字节的低 4 位作为偏移量
  const offset = hmacBytes[hmacBytes.length - 1] & 0x0f;

  // 从偏移量开始提取 4 个字节，并屏蔽最高位 (0x7f)
  const binary =
    ((hmacBytes[offset] & 0x7f) << 24) |
    (hmacBytes[offset + 1] << 16) |
    (hmacBytes[offset + 2] << 8) |
    hmacBytes[offset + 3];

  // 6. 取模并补齐前导零，生成最终验证码
  const otp = (binary % Math.pow(10, digits)).toString().padStart(digits, '0');

  return otp;
}

// --- 测试运行 ---
/*generateTOTP(secret).then(code => {
  console.log(`当前生成的 2FA 验证码: ${code}`);
}).catch(err => {
  console.error('生成失败:', err);
});*/
