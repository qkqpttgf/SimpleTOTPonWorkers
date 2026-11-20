
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
        return await listpage(env);
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
    if (url.pathname == "/login") {
      if (request.method == "GET") {
        return loginpage();
      }
      if (request.method == "POST") {
        //await request.json() await request.text() await request.formData();
        let data = Object.fromEntries(await request.formData());
        if (data.name == env.AdminName && data.pass == env.AdminPass) {
          return await loginsucces(data.name, data.pass);
        } else {
          return loginpage();
        }
      }
    }
    if (url.pathname == "/add") {
      if (!validuser) return backpage();
      if (request.method == "GET") {
        return addpage();
      }
      if (request.method == "POST") {
        let data = Object.fromEntries(await request.formData());
        if (data.name == env.AdminName && data.pass == env.AdminPass) {
          return await loginsucces(data.name, data.pass);
        } else {
          return addpage();
        }
      }
    }
    if (url.pathname == "/check") {
      if (!validuser) return backpage();
      let tmp = url.search.substring(1).split("&");
      let query = new Object();
      tmp.forEach(t => {
        let q = t.split("=");
        query[q[0]] = q[1];
      });
      let res = "";
      if (query["s"]) {
        try {
          res = await generateTOTP(query["s"]);
          await savesecret(env, query["s"]);
          return new Response(res, htmlhead());
        } catch (error) {
          return new Response(error + " " + query["s"], htmlhead(400));
        }
      } else {
        res = "no secret: " + url.search;
        return new Response(htmlbody("", res), htmlhead());
      }
    }
    return new Response(htmlbody("", s), htmlhead());
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
  return new Response(htmlbody(title, html), htmlhead());
}
function backpage(stat, msg) {
  if (!stat) stat = 401;
  if (!msg) msg = "出错";
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
  if (Date.now() - a[1] > 60 * 60 * 1000) return false;
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
        if (t == 1) {
            document.getElementById("code").textContent = "";
            document.getElementById("countdown").innerHTML = "";
        }
        if (t == 29) {
            //clearInterval(countdown);
            refresh();
        }
    }, 1000);
    // 扫码成功回调
    function onScanSuccess(decodedText, decodedResult) {
        if (scaning) return;
        html5QrcodeScanner.clear();
        scaning = true;
        // 如果是链接直接跳转：location.href = decodedText;
        if (/^otpauth?:\\/\\//.test(decodedText)) {
            let otp = new URL(decodedText);
            let q = new Object();
            otp.search.substring(1).split("&").forEach(q1 => {
                let q2 = q1.split("=");
                q[q2[0]] = q2[1];
            });
            document.getElementById('result').innerText = q["secret"];
            refresh();
        }
    }
    // 扫码失败（持续扫描中会频繁触发，一般只打印）
    function onScanFailure(error) {
        // console.warn(error);
    }
    // 刷新用
    function refresh() {
        let secret = document.getElementById("result").textContent;
        if (secret == "") return;
        fetch("/check?s=" + secret).then(res => {
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
        let name = t.name;
        if (!name) name = label;
        let secret = t.secret;
        if (name && secret) {
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
async function listpage(env) {
  let s = `<style>
  .code {
    font-size: 28px;
    margin: 10px;
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
<table id="ctn"></table>
<script>
  var codes = ` + JSON.stringify(await getKVdata(env.FAKV)) + `;
  var containor = document.getElementById("ctn");
  var needfresh = true;
  var countdown = setInterval(() => {
    let t = 30 - Math.floor(Date.now() / 1000) % 30;
    document.querySelectorAll(".countdown").forEach(c => {
      c.textContent = t;
    });
    if (t == 29) location.reload(true);
  }, 1000);
  codes.forEach(code => {
    let d = document.createElement("tr");
    containor.appendChild(d);
    let n = document.createElement("td");
    n.id = code["label"];
    n.textContent = code["name"];
    n.setAttribute("onclick", "editname(this);");
    d.appendChild(n);
    let c = document.createElement("td");
    c.className = "code";
    c.textContent = code["code"];
    d.appendChild(c);
    let c1 = document.createElement("td");
    c1.className = "countdown";
    d.appendChild(c1);
  });
  function editname(btn) {
    clearInterval(countdown);
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
    });
  }
</script>
`;
  return new Response(htmlbody("", s), htmlhead());
}
async function editlabel(kv, label, name) {
  let tmp = await kv.get(label);
  if (!tmp) return false;
  let tmp1 = JSON.parse(tmp);
  tmp1["name"] = name;
  await kv.put(label, JSON.stringify(tmp1));
  return true;
}
async function savesecret(env, secret) {
  let exist = false;
  let list = await env.FAKV.get("TOTPList");
  let list1 = new Array();
  if (list) {
    list1 = JSON.parse(list);
    for (let i = 0; i < list1.length; i++) {
      let label = list1[i];
      let t = await env.FAKV.get(label);
      if (t) {
        t = JSON.parse(t);
        if (secret === t["secret"]) exist = true;
      }
    }
  }
  if (exist) return;
  let label = Date.now();
  list1.push(label);
  let t = new Object();
  t["secret"] = secret;
  await env.FAKV.put("TOTPList", JSON.stringify(list1));
  await env.FAKV.put(label, JSON.stringify(t));
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
