// 事件委托一致性检查：
// 1) HTML/app.js 里不得再出现内联 handler（onclick= 等）
// 2) index.html 与 app.js 动态字符串里的每个 data-act 都必须在 ACTIONS 白名单里
// 3) app.js 语法可解析
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');

var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var appSrc = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('FAIL: ' + msg); } }

// 1) 内联 handler 清零
var inlineRe = /\son(click|change|input|keydown|keyup|submit|mouseover)\s*=/g;
var found = [];
var m;
while ((m = inlineRe.exec(html))) found.push('index.html: ' + m[0]);
while ((m = inlineRe.exec(appSrc))) found.push('app.js: ' + m[0]);
ok(found.length === 0, '残留内联 handler: ' + found.join(' ; '));

// 2) ACTIONS 覆盖检查：从 app.js 源码提取白名单键
var actBlock = appSrc.slice(appSrc.indexOf('var ACTIONS = {'), appSrc.indexOf('function dispatchAction'));
ok(actBlock.length > 100 && actBlock.length < 4000, 'ACTIONS 块定位失败');

var keys = new Set();
var keyRe = /^\s{4}([A-Za-z_$][\w$]*):/gm;
while ((m = keyRe.exec(actBlock))) keys.add(m[1]);

var used = new Set();
var useRe = /data-act="([A-Za-z_$][\w$]*)"/g;
while ((m = useRe.exec(html))) used.add(m[1]);
while ((m = useRe.exec(appSrc))) used.add(m[1]);
var missing = [];
used.forEach(function (u) { if (!keys.has(u)) missing.push(u); });
ok(missing.length === 0, 'data-act 未在 ACTIONS 白名单: ' + missing.join(', '));

// 白名单里的动作必须是 app.js 里的真实函数（防拼写错）——零参映射是 `name: name` 形式
var mapRe = /^\s{4}([A-Za-z_$][\w$]*):\s*([A-Za-z_$][\w$]*),\s*$/gm;
while ((m = mapRe.exec(actBlock))) {
    ok(new RegExp('function\\s+' + m[2] + '\\s*\\(').test(appSrc), 'ACTIONS 引用了不存在的函数: ' + m[2]);
}

// 3) app.js 语法
try { new Function(appSrc); pass++; } catch (e) { fail++; console.log('FAIL: app.js 语法错误: ' + e.message); }

// 4) index.html 引用的脚本都存在
var srcRe = /<script[^>]*src="([^"?]+)/g;
while ((m = srcRe.exec(html))) {
    ok(fs.existsSync(path.join(root, m[1])), '脚本不存在: ' + m[1]);
}

console.log('pass=' + pass + ' fail=' + fail);
