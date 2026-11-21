// 仓库卫生检查：确保 API key 不会被提交进仓库。
// 背景：config.js 是仓库文件，谁 clone 都能看到；key 一旦写进去就等于公开。
// 正确做法：应用内「⚙」填写（只存本机 localStorage），config.js 里保持空字符串。
//
// 这个测试扫描源码文件里「看起来像 key 的赋值」，发现就失败，提醒改用 ⚙。

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');

// 参与检查的仓库文件（不含 vendor/、data/、二进制）
var FILES = [
    'config.js', 'app.js', 'geocode.js', 'kinship.js',
    'index.html', 'style.css', 'README.md', 'server.py',
    'tests/tile.test.js', 'tests/region.test.js',
    'tests/geocode.test.js', 'tests/kinship.test.js'
];

var pass = 0, fail = 0;
function ok(cond, msg) {
    if (cond) pass++;
    else { fail++; console.log('FAIL: ' + msg); }
}

// 高危模式：变量名里带 KEY/TK/TOKEN/SECRET，值是 16 位以上连续字母数字/下划线/连字符
var PATTERNS = [
    { re: /(AMAP_KEY|TIANDITU_KEY|TDT_KEY|API_KEY|TOKEN|SECRET)\s*[:=]\s*['"]([A-Za-z0-9_\-]{16,})['"]/g, what: 'key 赋值' },
    { re: /[?&](key|tk|ak|token)=([A-Za-z0-9]{24,})/g, what: 'URL 里内嵌 key' }
];

FILES.forEach(function (rel) {
    var abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    var src = fs.readFileSync(abs, 'utf8');
    PATTERNS.forEach(function (p) {
        var m;
        p.re.lastIndex = 0;
        while ((m = p.re.exec(src)) !== null) {
            var where = rel + ' 第 ' + (src.slice(0, m.index).split('\n').length) + ' 行';
            ok(false, where + ' 疑似' + p.what + '：' + m[0].slice(0, 40) + '…（请改用应用内 ⚙ 填写）');
        }
    });
});

// config.js 里的两个 key 必须是空字符串
var cfg = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
ok(/AMAP_KEY:\s*''/.test(cfg), "config.js 的 AMAP_KEY 必须是 ''");
ok(/TIANDITU_KEY:\s*''/.test(cfg), "config.js 的 TIANDITU_KEY 必须是 ''");

// 反向自检：模式本身要能抓到"假 key"，否则测试形同虚设
var fake = "AMAP_KEY: '0123456789abcdef0123456789abcdef'";
ok(PATTERNS[0].re.test(fake), '检查模式本身应能识别伪造的 key（自检）');

console.log('pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);