(function (global) {
  'use strict';

  var TYPE_GROUPS = [
    {
      group: '祖辈',
      types: ['爷爷', '奶奶', '外公', '外婆']
    },
    {
      group: '父辈',
      types: ['父亲', '母亲', '伯父', '叔父', '姑姑', '舅舅', '姨妈']
    },
    {
      group: '平辈',
      types: ['配偶', '哥哥', '弟弟', '姐姐', '妹妹', '堂兄弟', '表亲']
    },
    {
      group: '晚辈',
      types: ['儿子', '女儿', '侄子', '侄女', '外甥', '外甥女', '孙子', '孙女', '外孙', '外孙女']
    },
    {
      group: '姻亲',
      types: ['岳父', '岳母', '公公', '婆婆']
    }
  ];

  var GROUP_DELTA = {
    '祖辈': -1,
    '父辈': -1,
    '平辈': 0,
    '晚辈': 1,
    '姻亲': -1
  };

  // 直接关系里的「祖辈/孙辈」是跨两辈，不能按组统一算 ±1：
  //   爷爷/奶奶/外公/外婆 = 上两辈（-2）
  //   孙子/孙女/外孙/外孙女 = 下两辈（+2）
  // 其余晚辈（儿子/女儿/侄子/侄女/外甥/外甥女）仍是下一辈（+1）。
  var TYPE_DELTA = {
    '爷爷': -2, '奶奶': -2, '外公': -2, '外婆': -2,
    // 大婆 = 爷爷辈里最大的那位（奶奶）：同为祖辈上两代
    '大婆': -2,
    '孙子': 2, '孙女': 2, '外孙': 2, '外孙女': 2
  };

  var typeGroup = {};
  TYPE_GROUPS.forEach(function (g) {
    g.types.forEach(function (t) { typeGroup[t] = g.group; });
  });

  function delta(type) {
    if (TYPE_DELTA[type] !== undefined) return TYPE_DELTA[type];
    var g = typeGroup[type];
    return g === undefined ? 0 : GROUP_DELTA[g];
  }

  function gendered(person, m, f, both) {
    if (!person || !person.gender) return both;
    return person.gender === 'm' ? m : f;
  }

  function byGender(m, f, both) {
    return function (n) { return gendered(n, m, f, both || (m + '/' + f)); };
  }

  /* ===================================================================
   * 称谓词表：规范称谓 → 俗称 / 别称
   * 规范称谓用「书面/族谱」里的正名，alias 收民间口语。各地叫法差别很大
   * （例如「太爷爷」在多数北方地区指曾祖父，也有地方（本项目的示例用法）
   * 把爷爷的爷爷叫太爷爷），所以同一个别称可能挂在相邻两代上。
   * =================================================================== */
  var TERMS = {
    /* 祖辈 */
    '爷爷': { alias: ['祖父', '阿公'] },
    '奶奶': { alias: ['祖母', '阿婆', '大婆'] },
    '外公': { alias: ['外祖父', '姥爷', '外爷'] },
    '外婆': { alias: ['外祖母', '姥姥', '姥娘'] },
    '伯祖': { alias: ['伯祖父', '伯公', '大爷爷'] },
    '叔祖': { alias: ['叔祖父', '叔公', '小爷爷'] },
    '姑祖母': { alias: ['姑婆', '姑奶奶', '姑奶'] },
    '舅祖父': { alias: ['舅公', '舅爷', '舅爷爷'] },
    '姨祖母': { alias: ['姨婆', '姨奶奶'] },
    '外伯祖': { alias: ['外伯公', '大姥爷'] },
    '外叔祖': { alias: ['外叔公', '小姥爷'] },
    '外姑祖母': { alias: ['外姑婆', '姑姥姥'] },
    '外舅祖父': { alias: ['外舅公', '舅姥爷'] },
    '外姨祖母': { alias: ['外姨婆', '姨姥姥'] },
    /* 父辈 */
    '父亲': { alias: ['爸爸', '爸'] },
    '母亲': { alias: ['妈妈', '娘', '妈'] },
    // 本项目家族：父亲这边按和父亲比的排行叫——「爹」=父亲的哥哥(伯父)，不是直系父亲
    '伯父': { alias: ['伯伯', '大伯', '大爷', '爹'] },
    '叔父': { alias: ['叔叔', '叔'] },
    '姑姑': { alias: ['姑妈', '姑母'] },
    '舅舅': { alias: ['舅父', '舅'] },
    '姨妈': { alias: ['姨母', '阿姨'] },
    '伯母': { alias: ['大娘', '伯娘', '大妈'] },
    '婶婶': { alias: ['婶母', '婶娘', '婶子'] },
    '姑父': { alias: ['姑丈', '姑爷'] },
    '舅妈': { alias: ['舅母', '舅娘'] },
    '姨父': { alias: ['姨丈', '姨夫'] },
    '堂伯': { alias: ['堂伯父', '堂伯伯'] },
    '堂叔': { alias: ['堂叔父', '堂叔叔'] },
    '堂姑': { alias: ['堂姑母', '堂姑姑'] },
    '表伯': { alias: ['表伯父'] },
    '表叔': { alias: ['表叔父'] },
    '表姑': { alias: ['表姑母'] },
    '堂舅': { alias: ['堂舅父'] },
    '表舅': { alias: ['表舅父'] },
    '堂姨': { alias: ['堂姨母'] },
    '表姨': { alias: ['表姨母'] },
    '伯祖母': { alias: ['伯婆', '大奶奶'] },
    '叔祖母': { alias: ['叔婆', '小奶奶'] },
    '姑祖父': { alias: ['姑公', '姑爷爷'] },
    '舅祖母': { alias: ['舅婆', '舅奶奶'] },
    '姨祖父': { alias: ['姨公', '姨爷爷'] },
    '堂伯母': { alias: ['堂伯娘'] },
    '堂婶': { alias: ['堂婶娘', '堂婶子'] },
    '表伯母': { alias: ['表伯娘'] },
    '表婶': { alias: ['表婶娘', '表婶子'] },
    '堂舅妈': { alias: ['堂舅母'] },
    '表舅妈': { alias: ['表舅母'] },
    '堂姨父': { alias: ['堂姨丈'] },
    '表姨父': { alias: ['表姨丈'] },
    /* 平辈 */
    '哥哥': { alias: ['兄长', '大哥'] },
    '弟弟': { alias: ['胞弟', '小弟'] },
    '姐姐': { alias: ['姊', '大姐'] },
    '妹妹': { alias: ['小妹'] },
    '嫂子': { alias: ['嫂嫂', '大嫂'] },
    '弟媳': { alias: ['弟妹', '弟妇'] },
    '姐夫': { alias: ['姐丈'] },
    '妹夫': { alias: ['妹婿'] },
    '堂兄弟': { alias: ['堂兄', '堂弟', '堂哥'] },
    '堂姐妹': { alias: ['堂姐', '堂妹'] },
    '表兄弟': { alias: ['表兄', '表弟', '表哥'] },
    '表姐妹': { alias: ['表姐', '表妹'] },
    '从堂兄弟': { alias: ['从堂兄', '从堂弟', '再从兄弟'] },
    '从堂姐妹': { alias: ['从堂姐', '从堂妹', '再从姐妹'] },
    '从表兄弟': { alias: ['从表兄', '从表弟'] },
    '从表姐妹': { alias: ['从表姐', '从表妹'] },
    '内兄': { alias: ['大舅子', '妻兄'] },
    '内弟': { alias: ['小舅子', '妻弟'] },
    '姨姐': { alias: ['大姨子', '妻姐'] },
    '姨妹': { alias: ['小姨子', '妻妹'] },
    '大伯子': { alias: ['夫兄', '大伯哥'] },
    '小叔子': { alias: ['夫弟'] },
    '大姑子': { alias: ['夫姐'] },
    '小姑子': { alias: ['夫妹'] },
    /* 晚辈 */
    '儿媳': { alias: ['媳妇', '儿媳妇'] },
    '女婿': { alias: ['姑爷', '半子'] },
    '侄子': { alias: ['侄儿'] },
    '侄女': { alias: [] },
    '侄媳': { alias: ['侄媳妇'] },
    '侄女婿': { alias: ['侄婿'] },
    '外甥': { alias: ['外甥儿'] },
    '外甥女': { alias: [] },
    '外甥媳妇': { alias: [] },
    '外甥女婿': { alias: [] },
    '孙子': { alias: ['孙儿'] },
    '孙女': { alias: [] },
    '孙媳': { alias: ['孙媳妇'] },
    '孙女婿': { alias: ['孙婿'] },
    '外孙': { alias: ['外孙子', '外孙儿'] },
    '外孙女': { alias: [] },
    '侄孙': { alias: ['侄孙子'] },
    '侄孙女': { alias: [] },
    '外甥孙': { alias: ['甥孙', '外甥孙子'] },
    '外甥孙女': { alias: ['甥孙女'] },
    '侄外孙': { alias: ['侄甥孙'] },
    '侄外孙女': { alias: [] },
    '表侄': { alias: ['表侄子'] },
    '表侄女': { alias: [] },
    '内侄': { alias: ['妻侄', '内侄子'] },
    '内侄女': { alias: ['妻侄女'] },
    '姨甥': { alias: ['妻甥', '姨甥子'] },
    '姨甥女': { alias: [] },
    '曾孙': { alias: ['重孙', '重孙子'] },
    '曾孙女': { alias: ['重孙女'] },
    '玄孙': { alias: ['元孙'] },
    '玄孙女': { alias: ['元孙女'] },
    '来孙': { alias: [] },
    '来孙女': { alias: [] },
    '晜孙': { alias: ['昆孙'] },
    '晜孙女': { alias: ['昆孙女'] },
    '仍孙': { alias: ['礽孙'] },
    '仍孙女': { alias: ['礽孙女'] },
    '云孙': { alias: [] },
    '云孙女': { alias: [] },
    '耳孙': { alias: [] },
    '耳孙女': { alias: [] },
    /* 五服以上直系尊亲属（俗称各地差异最大） */
    '曾祖父': { alias: ['太爷爷', '太公', '老爷爷'] },
    '曾祖母': { alias: ['太奶奶', '太婆', '老奶奶'] },
    '高祖父': { alias: ['老太爷', '祖爷爷', '太爷爷'] },
    '高祖母': { alias: ['祖奶奶', '老太奶奶', '太奶奶'] },
    '天祖父': { alias: ['天祖'] },
    '天祖母': { alias: [] },
    '烈祖父': { alias: ['烈祖'] },
    '烈祖母': { alias: [] },
    '太祖父': { alias: ['太祖'] },
    '太祖母': { alias: [] },
    '远祖父': { alias: ['远祖'] },
    '远祖母': { alias: [] },
    '鼻祖': { alias: ['始祖'] },
    '鼻祖母': { alias: ['始祖奶奶'] },
    '外曾祖父': { alias: ['太外公', '外太公', '太姥爷'] },
    '外曾祖母': { alias: ['太外婆', '外太婆', '太姥姥'] },
    '外高祖父': { alias: ['外老太爷', '外祖爷爷'] },
    '外高祖母': { alias: ['外祖奶奶'] },
    '外天祖父': { alias: ['外天祖'] },
    '外天祖母': { alias: [] },
    '曾外祖父': { alias: ['太公', '外太公'] },
    '曾外祖母': { alias: ['太婆', '外太婆'] },
    '高外祖父': { alias: ['高外祖'] },
    '高外祖母': { alias: [] },
    '天外祖父': { alias: [] },
    '天外祖母': { alias: [] },
    /* 姻亲 */
    '岳父': { alias: ['丈人', '老丈人', '泰山'] },
    '岳母': { alias: ['丈母娘', '泰水'] },
    '公公': { alias: ['公爹', '老公公'] },
    '婆婆': { alias: ['婆母', '老婆婆'] },
    '岳祖父': { alias: ['太岳父', '岳公'] },
    '岳祖母': { alias: ['太岳母', '岳婆'] },
    '祖公公': { alias: ['太公公', '祖公'] },
    '祖婆婆': { alias: ['太婆婆', '祖婆'] },
    '亲家公': { alias: ['亲家'] },
    '亲家母': { alias: ['亲家'] }
  };

  /* ===== relationship.js 词表 → 本项目正名 =====
   * relationship.js 偏口语、带排行（爸爸、叔叔、大姑、大舅、堂哥/堂弟…），
   * 本项目用族谱正名（父亲、叔父、姑姑、舅舅、堂兄弟…）。这里把两套词对齐，
   * 保证「换算交给 relationship.js」之后，界面仍然是本项目一贯的叫法。
   * 词表里没有的词（连襟、姻侄、兄弟眷父…）原样保留，相当于自动扩充词表。 */
  var CANON_EXTRA = {
    /* 配偶 / 排行口语 */
    '老公': '配偶', '老婆': '配偶', '丈夫': '配偶', '妻子': '配偶',
    '大伯': '伯父', '小伯': '伯父',
    '小叔': '叔父', '大叔': '叔父',
    '大姑': '姑姑', '小姑': '姑姑', '二姑': '姑姑', '三姑': '姑姑', '四姑': '姑姑', '五姑': '姑姑',
    '大舅': '舅舅', '小舅': '舅舅', '二舅': '舅舅', '三舅': '舅舅', '四舅': '舅舅', '五舅': '舅舅',
    '大姨': '姨妈', '小姨': '姨妈', '二姨': '姨妈', '三姨': '姨妈', '四姨': '姨妈', '五姨': '姨妈',
    '大婶': '婶婶', '小婶': '婶婶',
    '大姑丈': '姑父', '小姑丈': '姑父', '二姑丈': '姑父', '三姑丈': '姑父', '四姑丈': '姑父', '五姑丈': '姑父',
    '大姨丈': '姨父', '小姨丈': '姨父', '二姨丈': '姨父', '三姨丈': '姨父', '四姨丈': '姨父', '五姨丈': '姨父',
    '大舅妈': '舅妈', '小舅妈': '舅妈', '二舅妈': '舅妈', '三舅妈': '舅妈',

    /* 祖辈旁系的口语 */
    '大舅爷': '舅祖父', '大舅公': '舅祖父',
    '姑爷爷': '姑祖父', '姑奶奶': '姑祖母',

    /* 表亲：姑表/舅表/姨表统一并到本项目的「表」字辈 */
    '姑表哥': '表兄弟', '姑表弟': '表兄弟', '姑表兄': '表兄弟',
    '舅表哥': '表兄弟', '舅表弟': '表兄弟', '舅表兄': '表兄弟',
    '姨表哥': '表兄弟', '姨表弟': '表兄弟', '姨表兄': '表兄弟',
    '姑表姐': '表姐妹', '姑表妹': '表姐妹',
    '舅表姐': '表姐妹', '舅表妹': '表姐妹',
    '姨表姐': '表姐妹', '姨表妹': '表姐妹',
    '姑表伯父': '表伯', '舅表伯父': '表伯',
    '姑表叔父': '表叔', '舅表叔父': '表叔',
    '姑表姑母': '表姑', '舅表姑母': '表姑', '姨表姑母': '表姑',
    '姑表舅父': '表舅', '姨表舅父': '表舅',
    '姨姨母': '表姨',
    '姑表侄男': '表侄', '舅表侄男': '表侄', '姨侄男': '表侄',
    '姑表侄女': '表侄女', '舅表侄女': '表侄女', '姨侄女': '表侄女',

    /* 姻亲口语 */
    '夫侄': '侄子', '夫侄子': '侄子',
    '妻侄': '内侄', '妻侄子': '内侄'
  };

  // 正名 + 俗称都指向正名；relationship.js 给的「爸爸/叔叔/堂哥」会先落到这里。
  var CANON = {};
  Object.keys(TERMS).forEach(function (canon) {
    if (!CANON[canon]) CANON[canon] = canon;
    (TERMS[canon].alias || []).forEach(function (alias) {
      if (!CANON[alias]) CANON[alias] = canon;
    });
  });
  Object.keys(CANON_EXTRA).forEach(function (word) {
    CANON[word] = CANON_EXTRA[word];
  });

  function canonicalTitle(title) {
    var s = String(title == null ? '' : title).trim();
    return CANON[s] || s;
  }

  /* ===================================================================
   * 核心规则表：键是「上级已定称谓 + ｜ + 这一步的关系词」，值是新的称谓。
   * 值可以是字符串，也可以是 function(新人物, 起点「我」) —— 用于需要看
   * 性别/起点性别的称呼（如「父亲|儿子」→ 兄弟/姐妹）。
   * 规则与代码分离：全部称谓都在这张表里，方便校对与扩充。
   * =================================================================== */
  var RULES = {
    '父亲|父亲': '爷爷',
    '父亲|母亲': '奶奶',
    '母亲|父亲': '外公',
    '母亲|母亲': '外婆',
    '伯父|父亲': '爷爷',
    '伯父|母亲': '奶奶',
    '叔父|父亲': '爷爷',
    '叔父|母亲': '奶奶',
    '姑姑|父亲': '爷爷',
    '姑姑|母亲': '奶奶',
    '舅舅|父亲': '外公',
    '舅舅|母亲': '外婆',
    '姨妈|父亲': '外公',
    '姨妈|母亲': '外婆',
    '哥哥|父亲': '父亲',
    '哥哥|母亲': '母亲',
    '弟弟|父亲': '父亲',
    '弟弟|母亲': '母亲',
    '姐姐|父亲': '父亲',
    '姐姐|母亲': '母亲',
    '妹妹|父亲': '父亲',
    '妹妹|母亲': '母亲',
    '父亲|哥哥': '伯父',
    '父亲|弟弟': '叔父',
    '父亲|姐姐': '姑姑',
    '父亲|妹妹': '姑姑',
    '母亲|哥哥': '舅舅',
    '母亲|弟弟': '舅舅',
    '母亲|姐姐': '姨妈',
    '母亲|妹妹': '姨妈',
    '父亲|儿子': function (n) { return gendered(n, '兄弟', '姐妹', '兄弟/姐妹'); },
    '父亲|女儿': function (n) { return gendered(n, '兄弟', '姐妹', '兄弟/姐妹'); },
    '母亲|儿子': function (n) { return gendered(n, '兄弟', '姐妹', '兄弟/姐妹'); },
    '母亲|女儿': function (n) { return gendered(n, '兄弟', '姐妹', '兄弟/姐妹'); },
    '儿子|儿子': function (n) { return gendered(n, '孙子', '孙女', '孙子/孙女'); },
    '儿子|女儿': function (n) { return gendered(n, '孙子', '孙女', '孙子/孙女'); },
    '女儿|儿子': function (n) { return gendered(n, '外孙', '外孙女', '外孙/外孙女'); },
    '女儿|女儿': function (n) { return gendered(n, '外孙', '外孙女', '外孙/外孙女'); },
    // 「父亲的儿子」在本地先归成「兄弟/姐妹」，再往下走时要把具体称谓补回来，
    // 否则 relationship.js 的「侄子/儿子」「外甥」这类候选里选不出家族叫法。
    '兄弟|儿子': function (n) { return gendered(n, '侄子', '侄女', '侄子/侄女'); },
    '兄弟|女儿': function (n) { return gendered(n, '侄子', '侄女', '侄子/侄女'); },
    '姐妹|儿子': function (n) { return gendered(n, '外甥', '外甥女', '外甥/外甥女'); },
    '姐妹|女儿': function (n) { return gendered(n, '外甥', '外甥女', '外甥/外甥女'); },
    '兄弟|配偶': '嫂子/弟媳',
    '姐妹|配偶': '姐夫/妹夫',
    '哥哥|儿子': function (n) { return gendered(n, '侄子', '侄女', '侄子/侄女'); },
    '哥哥|女儿': function (n) { return gendered(n, '侄子', '侄女', '侄子/侄女'); },
    '弟弟|儿子': function (n) { return gendered(n, '侄子', '侄女', '侄子/侄女'); },
    '弟弟|女儿': function (n) { return gendered(n, '侄子', '侄女', '侄子/侄女'); },
    '姐姐|儿子': function (n) { return gendered(n, '外甥', '外甥女', '外甥/外甥女'); },
    '姐姐|女儿': function (n) { return gendered(n, '外甥', '外甥女', '外甥/外甥女'); },
    '妹妹|儿子': function (n) { return gendered(n, '外甥', '外甥女', '外甥/外甥女'); },
    '妹妹|女儿': function (n) { return gendered(n, '外甥', '外甥女', '外甥/外甥女'); },
    '配偶|父亲': function (n, ego) {
      if (!ego || !ego.gender) return '岳父/公公';
      return ego.gender === 'm' ? '岳父' : '公公';
    },
    '配偶|母亲': function (n, ego) {
      if (!ego || !ego.gender) return '岳母/婆婆';
      return ego.gender === 'm' ? '岳母' : '婆婆';
    },
    '父亲|配偶': function (n) { return gendered(n, '父亲', '母亲', '配偶'); },
    '母亲|配偶': function (n) { return gendered(n, '父亲', '母亲', '配偶'); },
    '配偶|儿子': function (n) { return gendered(n, '儿子', '女儿', '儿子/女儿'); },
    '配偶|女儿': function (n) { return gendered(n, '儿子', '女儿', '儿子/女儿'); },
    '儿子|配偶': function (n) { return gendered(n, '女婿', '儿媳', '儿媳/女婿'); },
    '女儿|配偶': function (n) { return gendered(n, '女婿', '儿媳', '儿媳/女婿'); },
    '伯父|儿子': function (n) { return gendered(n, '堂兄弟', '堂姐妹', '堂兄弟/堂姐妹'); },
    '伯父|女儿': function (n) { return gendered(n, '堂兄弟', '堂姐妹', '堂兄弟/堂姐妹'); },
    '叔父|儿子': function (n) { return gendered(n, '堂兄弟', '堂姐妹', '堂兄弟/堂姐妹'); },
    '叔父|女儿': function (n) { return gendered(n, '堂兄弟', '堂姐妹', '堂兄弟/堂姐妹'); },
    '姑姑|儿子': function (n) { return gendered(n, '表兄弟', '表姐妹', '表兄弟/表姐妹'); },
    '姑姑|女儿': function (n) { return gendered(n, '表兄弟', '表姐妹', '表兄弟/表姐妹'); },
    '舅舅|儿子': function (n) { return gendered(n, '表兄弟', '表姐妹', '表兄弟/表姐妹'); },
    '舅舅|女儿': function (n) { return gendered(n, '表兄弟', '表姐妹', '表兄弟/表姐妹'); },
    '姨妈|儿子': function (n) { return gendered(n, '表兄弟', '表姐妹', '表兄弟/表姐妹'); },
    '姨妈|女儿': function (n) { return gendered(n, '表兄弟', '表姐妹', '表兄弟/表姐妹'); },
    '堂兄弟|儿子': function (n) { return gendered(n, '堂侄', '堂侄女', '堂侄/堂侄女'); },
    '堂兄弟|女儿': function (n) { return gendered(n, '堂侄', '堂侄女', '堂侄/堂侄女'); },
    '堂姐妹|儿子': function (n) { return gendered(n, '堂外甥', '堂外甥女', '堂外甥/堂外甥女'); },
    '堂姐妹|女儿': function (n) { return gendered(n, '堂外甥', '堂外甥女', '堂外甥/堂外甥女'); },
    '表兄弟|儿子': function (n) { return gendered(n, '表侄', '表侄女', '表侄/表侄女'); },
    '表兄弟|女儿': function (n) { return gendered(n, '表侄', '表侄女', '表侄/表侄女'); },
    '表姐妹|儿子': function (n) { return gendered(n, '表外甥', '表外甥女', '表外甥/表外甥女'); },
    '表姐妹|女儿': function (n) { return gendered(n, '表外甥', '表外甥女', '表外甥/表外甥女'); },
    '侄子|儿子': function (n) { return gendered(n, '侄孙', '侄孙女', '侄孙/侄孙女'); },
    '侄子|女儿': function (n) { return gendered(n, '侄孙', '侄孙女', '侄孙/侄孙女'); },
    '侄女|儿子': function (n) { return gendered(n, '侄外孙', '侄外孙女', '侄外孙/侄外孙女'); },
    '侄女|女儿': function (n) { return gendered(n, '侄外孙', '侄外孙女', '侄外孙/侄外孙女'); },
    // 舅祖父/姨祖母看我 = 外甥的子女，即外甥孙
    '外甥|儿子': function (n) { return gendered(n, '外甥孙', '外甥孙女', '外甥孙/外甥孙女'); },
    '外甥|女儿': function (n) { return gendered(n, '外甥孙', '外甥孙女', '外甥孙/外甥孙女'); },
    '外甥女|儿子': function (n) { return gendered(n, '外甥孙', '外甥孙女', '外甥孙/外甥孙女'); },
    '外甥女|女儿': function (n) { return gendered(n, '外甥孙', '外甥孙女', '外甥孙/外甥孙女'); },

    /* ---- 祖辈的兄弟姐妹：五服内的旁系尊亲属 ---- */
    '爷爷|哥哥': '伯祖',
    '爷爷|弟弟': '叔祖',
    '爷爷|姐姐': '姑祖母',
    '爷爷|妹妹': '姑祖母',
    '奶奶|哥哥': '舅祖父',
    '奶奶|弟弟': '舅祖父',
    '奶奶|姐姐': '姨祖母',
    '奶奶|妹妹': '姨祖母',
    '外公|哥哥': '外伯祖',
    '外公|弟弟': '外叔祖',
    '外公|姐姐': '外姑祖母',
    '外公|妹妹': '外姑祖母',
    '外婆|哥哥': '外舅祖父',
    '外婆|弟弟': '外舅祖父',
    '外婆|姐姐': '外姨祖母',
    '外婆|妹妹': '外姨祖母',
    /* 祖辈兄弟姐妹的儿女 = 父辈的「堂/表」亲戚 */
    '伯祖|儿子': function (n) { return gendered(n, '堂叔', '堂姑', '堂叔/堂姑'); },
    '伯祖|女儿': function (n) { return gendered(n, '堂姑', '堂姑', '堂叔/堂姑'); },
    '叔祖|儿子': function (n) { return gendered(n, '堂叔', '堂姑', '堂叔/堂姑'); },
    '叔祖|女儿': function (n) { return gendered(n, '堂姑', '堂姑', '堂叔/堂姑'); },
    '姑祖母|儿子': function (n) { return gendered(n, '表叔', '表姑', '表叔/表姑'); },
    '姑祖母|女儿': function (n) { return gendered(n, '表姑', '表姑', '表叔/表姑'); },
    '舅祖父|儿子': function (n) { return gendered(n, '表叔', '表姑', '表叔/表姑'); },
    '舅祖父|女儿': function (n) { return gendered(n, '表姑', '表姑', '表叔/表姑'); },
    '姨祖母|儿子': function (n) { return gendered(n, '表叔', '表姑', '表叔/表姑'); },
    '姨祖母|女儿': function (n) { return gendered(n, '表姑', '表姑', '表叔/表姑'); },
    /* 外祖辈兄弟姐妹的儿女 = 母辈的「堂/表」亲戚（堂舅、表舅…） */
    '外伯祖|儿子': function (n) { return gendered(n, '堂舅', '堂姨', '堂舅/堂姨'); },
    '外伯祖|女儿': function (n) { return gendered(n, '堂姨', '堂姨', '堂舅/堂姨'); },
    '外叔祖|儿子': function (n) { return gendered(n, '堂舅', '堂姨', '堂舅/堂姨'); },
    '外叔祖|女儿': function (n) { return gendered(n, '堂姨', '堂姨', '堂舅/堂姨'); },
    '外姑祖母|儿子': function (n) { return gendered(n, '表舅', '表姨', '表舅/表姨'); },
    '外姑祖母|女儿': function (n) { return gendered(n, '表姨', '表姨', '表舅/表姨'); },
    '外舅祖父|儿子': function (n) { return gendered(n, '表舅', '表姨', '表舅/表姨'); },
    '外舅祖父|女儿': function (n) { return gendered(n, '表姨', '表姨', '表舅/表姨'); },
    '外姨祖母|儿子': function (n) { return gendered(n, '表舅', '表姨', '表舅/表姨'); },
    '外姨祖母|女儿': function (n) { return gendered(n, '表姨', '表姨', '表舅/表姨'); },

    /* ---- 再往下一层：堂/表亲戚的子女 ---- */
    '堂伯|儿子': function (n) { return gendered(n, '从堂兄弟', '从堂姐妹', '从堂兄弟/从堂姐妹'); },
    '堂伯|女儿': function (n) { return gendered(n, '从堂姐妹', '从堂姐妹', '从堂兄弟/从堂姐妹'); },
    '堂叔|儿子': function (n) { return gendered(n, '从堂兄弟', '从堂姐妹', '从堂兄弟/从堂姐妹'); },
    '堂叔|女儿': function (n) { return gendered(n, '从堂姐妹', '从堂姐妹', '从堂兄弟/从堂姐妹'); },
    '堂姑|儿子': function (n) { return gendered(n, '表兄弟', '表姐妹', '表兄弟/表姐妹'); },
    '堂姑|女儿': function (n) { return gendered(n, '表姐妹', '表姐妹', '表兄弟/表姐妹'); },
    '表伯|儿子': function (n) { return gendered(n, '表兄弟', '表姐妹', '表兄弟/表姐妹'); },
    '表伯|女儿': function (n) { return gendered(n, '表姐妹', '表姐妹', '表兄弟/表姐妹'); },
    '表叔|儿子': function (n) { return gendered(n, '表兄弟', '表姐妹', '表兄弟/表姐妹'); },
    '表叔|女儿': function (n) { return gendered(n, '表姐妹', '表姐妹', '表兄弟/表姐妹'); },
    '表姑|儿子': function (n) { return gendered(n, '表兄弟', '表姐妹', '表兄弟/表姐妹'); },
    '表姑|女儿': function (n) { return gendered(n, '表姐妹', '表姐妹', '表兄弟/表姐妹'); },
    '堂舅|儿子': function (n) { return gendered(n, '从表兄弟', '从表姐妹', '从表兄弟/从表姐妹'); },
    '堂舅|女儿': function (n) { return gendered(n, '从表姐妹', '从表姐妹', '从表兄弟/从表姐妹'); },
    '堂姨|儿子': function (n) { return gendered(n, '从表兄弟', '从表姐妹', '从表兄弟/从表姐妹'); },
    '堂姨|女儿': function (n) { return gendered(n, '从表姐妹', '从表姐妹', '从表兄弟/从表姐妹'); },
    '表舅|儿子': function (n) { return gendered(n, '表兄弟', '表姐妹', '表兄弟/表姐妹'); },
    '表舅|女儿': function (n) { return gendered(n, '表姐妹', '表姐妹', '表兄弟/表姐妹'); },
    '表姨|儿子': function (n) { return gendered(n, '表兄弟', '表姐妹', '表兄弟/表姐妹'); },
    '表姨|女儿': function (n) { return gendered(n, '表姐妹', '表姐妹', '表兄弟/表姐妹'); },

    /* ---- 姻亲：哪个长辈的配偶该怎么叫 ---- */
    '伯父|配偶': '伯母',
    '叔父|配偶': '婶婶',
    '姑姑|配偶': '姑父',
    '舅舅|配偶': '舅妈',
    '姨妈|配偶': '姨父',
    '伯祖|配偶': '伯祖母',
    '叔祖|配偶': '叔祖母',
    '姑祖母|配偶': '姑祖父',
    '舅祖父|配偶': '舅祖母',
    '姨祖母|配偶': '姨祖父',
    '哥哥|配偶': '嫂子',
    '弟弟|配偶': '弟媳',
    '姐姐|配偶': '姐夫',
    '妹妹|配偶': '妹夫',
    '侄子|配偶': '侄媳',
    '侄女|配偶': '侄女婿',
    '外甥|配偶': '外甥媳妇',
    '外甥女|配偶': '外甥女婿',
    '孙子|配偶': '孙媳',
    '孙女|配偶': '孙女婿',
    '曾孙|配偶': '曾孙媳',
    '曾孙女|配偶': '曾孙女婿',
    /* 配偶的长辈：岳父/公公再往上 */
    '岳父|父亲': '岳祖父',
    '岳父|母亲': '岳祖母',
    '岳母|父亲': '岳祖父',
    '岳母|母亲': '岳祖母',
    '公公|父亲': '祖公公',
    '公公|母亲': '祖婆婆',
    '婆婆|父亲': '祖公公',
    '婆婆|母亲': '祖婆婆',
    /* 配偶的兄弟姐妹（看「我」是男是女：妻家 / 夫家） */
    '配偶|哥哥': function (n, ego) {
      if (!ego || !ego.gender) return '内兄/大伯子';
      return ego.gender === 'm' ? '内兄' : '大伯子';
    },
    '配偶|弟弟': function (n, ego) {
      if (!ego || !ego.gender) return '内弟/小叔子';
      return ego.gender === 'm' ? '内弟' : '小叔子';
    },
    '配偶|姐姐': function (n, ego) {
      if (!ego || !ego.gender) return '姨姐/大姑子';
      return ego.gender === 'm' ? '姨姐' : '大姑子';
    },
    '配偶|妹妹': function (n, ego) {
      if (!ego || !ego.gender) return '姨妹/小姑子';
      return ego.gender === 'm' ? '姨妹' : '小姑子';
    },
    /* 儿女亲家：儿媳/女婿的父母 */
    '儿媳|父亲': '亲家公',
    '儿媳|母亲': '亲家母',
    '女婿|父亲': '亲家公',
    '女婿|母亲': '亲家母'
  };

  /* ===================================================================
   * 五服代际词表（本土正名）
   * 直系尊亲属按「己身 → 父 → 祖父 → 曾祖父 → 高祖父 → 天祖父 → 烈祖父
   * → 太祖父 → 远祖父 → 鼻祖」九代排列；卑亲属对应「子 → 孙 → 曾孙 →
   * 玄孙 → 来孙 → 晜孙 → 仍孙 → 云孙 → 耳孙」。
   * 长链由这张表逐段接出来，不再退化成「爷爷的父亲」式的平铺路径。
   * =================================================================== */

  // 向上：起点（爷爷/奶奶/外公/外婆）+ 往上每代的男/女正名
  var UP_LINES = [
    {
      start: '爷爷',
      male: ['曾祖父', '高祖父', '天祖父', '烈祖父', '太祖父', '远祖父', '鼻祖'],
      female: ['曾祖母', '高祖母', '天祖母', '烈祖母', '太祖母', '远祖母', '鼻祖母']
    },
    {
      // 奶奶的娘家：父之母之父，加「外」而不占母系那一支
      start: '奶奶',
      male: ['曾外祖父', '高外祖父', '天外祖父', '烈外祖父', '太外祖父'],
      female: ['曾外祖母', '高外祖母', '天外祖母', '烈外祖母', '太外祖母']
    },
    {
      start: '外公',
      male: ['外曾祖父', '外高祖父', '外天祖父', '外烈祖父', '外太祖父'],
      female: ['外曾祖母', '外高祖母', '外天祖母', '外烈祖母', '外太祖母']
    },
    {
      // 外婆的父母与外公的父母同辈同支，叫法一样
      start: '外婆',
      male: ['外曾祖父', '外高祖父', '外天祖父', '外烈祖父', '外太祖父'],
      female: ['外曾祖母', '外高祖母', '外天祖母', '外烈祖母', '外太祖母']
    }
  ];

  UP_LINES.forEach(function (line) {
    // 起点往上一级（爷爷的父亲＝曾祖父，奶奶的父亲＝曾外祖父…）
    RULES[line.start + '|父亲'] = line.male[0];
    RULES[line.start + '|母亲'] = line.female[0];
    // 再往上只沿着男性祖先接：他的父亲＝再上一代，母亲＝再上一代的女祖
    for (var i = 0; i < line.male.length - 1; i++) {
      RULES[line.male[i] + '|父亲'] = line.male[i + 1];
      RULES[line.male[i] + '|母亲'] = line.female[i + 1];
    }
  });

  // 向下：直系卑亲属九代
  var DOWN_LINES = [
    { src: '孙子', male: '曾孙', female: '曾孙女', wai: false },
    { src: '孙女', male: '曾孙', female: '曾孙女', wai: true },
    { src: '曾孙', male: '玄孙', female: '玄孙女', wai: false },
    { src: '曾孙女', male: '玄孙', female: '玄孙女', wai: true },
    { src: '玄孙', male: '来孙', female: '来孙女', wai: false },
    { src: '玄孙女', male: '来孙', female: '来孙女', wai: true },
    { src: '来孙', male: '晜孙', female: '晜孙女', wai: false },
    { src: '来孙女', male: '晜孙', female: '晜孙女', wai: true },
    { src: '晜孙', male: '仍孙', female: '仍孙女', wai: false },
    { src: '晜孙女', male: '仍孙', female: '仍孙女', wai: true },
    { src: '仍孙', male: '云孙', female: '云孙女', wai: false },
    { src: '仍孙女', male: '云孙', female: '云孙女', wai: true },
    { src: '云孙', male: '耳孙', female: '耳孙女', wai: false },
    { src: '云孙女', male: '耳孙', female: '耳孙女', wai: true },
    // 女系后代一路带「外」：外孙 → 外曾孙 → 外玄孙 …
    { src: '外孙', male: '外曾孙', female: '外曾孙女', wai: false },
    { src: '外孙女', male: '外曾孙', female: '外曾孙女', wai: false },
    { src: '外曾孙', male: '外玄孙', female: '外玄孙女', wai: false },
    { src: '外曾孙女', male: '外玄孙', female: '外玄孙女', wai: false },
    { src: '外玄孙', male: '外来孙', female: '外来孙女', wai: false },
    { src: '外玄孙女', male: '外来孙', female: '外来孙女', wai: false }
  ];

  DOWN_LINES.forEach(function (line) {
    var rule = byGender(line.wai ? '外' + line.male : line.male,
                        line.wai ? '外' + line.female : line.female);
    RULES[line.src + '|儿子'] = rule;
    RULES[line.src + '|女儿'] = rule;
  });

  /* ===== 夫妻互称：关系从哪一侧录入，都能认出另一半 ===== */
  var COUPLES = [
    ['爷爷', '奶奶'], ['爷爷', '大婆'], ['外公', '外婆'],
    ['曾祖父', '曾祖母'], ['高祖父', '高祖母'], ['天祖父', '天祖母'],
    ['烈祖父', '烈祖母'], ['太祖父', '太祖母'], ['远祖父', '远祖母'], ['鼻祖', '鼻祖母'],
    ['外曾祖父', '外曾祖母'], ['外高祖父', '外高祖母'], ['外天祖父', '外天祖母'],
    ['曾外祖父', '曾外祖母'], ['高外祖父', '高外祖母'], ['天外祖父', '天外祖母'],
    ['伯父', '伯母'], ['叔父', '婶婶'], ['姑姑', '姑父'], ['舅舅', '舅妈'], ['姨妈', '姨父'],
    ['伯祖', '伯祖母'], ['叔祖', '叔祖母'], ['姑祖母', '姑祖父'],
    ['舅祖父', '舅祖母'], ['姨祖母', '姨祖父'],
    ['堂伯', '堂伯母'], ['堂叔', '堂婶'], ['表伯', '表伯母'], ['表叔', '表婶'],
    ['堂舅', '堂舅妈'], ['表舅', '表舅妈'], ['堂姨', '堂姨父'], ['表姨', '表姨父'],
    ['哥哥', '嫂子'], ['弟弟', '弟媳'], ['姐姐', '姐夫'], ['妹妹', '妹夫'],
    ['儿子', '儿媳'], ['女儿', '女婿'], ['侄子', '侄媳'], ['侄女', '侄女婿'],
    ['外甥', '外甥媳妇'], ['外甥女', '外甥女婿'],
    ['孙子', '孙媳'], ['孙女', '孙女婿'], ['曾孙', '曾孙媳'], ['曾孙女', '曾孙女婿'],
    ['岳父', '岳母'], ['公公', '婆婆'], ['岳祖父', '岳祖母'], ['祖公公', '祖婆婆']
  ];
  COUPLES.forEach(function (c) {
    // 不覆盖已有规则（儿子/女儿 的配偶要看对方性别，交给上面的函数处理）
    if (!Object.prototype.hasOwnProperty.call(RULES, c[0] + '|配偶')) RULES[c[0] + '|配偶'] = c[1];
    if (!Object.prototype.hasOwnProperty.call(RULES, c[1] + '|配偶')) RULES[c[1] + '|配偶'] = c[0];
  });

  /* ===== 旁系长辈的父母：兄弟姐妹同父母 ===== */
  var SIBLING_OF = [
    ['伯祖', '爷爷'], ['叔祖', '爷爷'], ['姑祖母', '爷爷'],
    ['舅祖父', '奶奶'], ['姨祖母', '奶奶'],
    ['外伯祖', '外公'], ['外叔祖', '外公'], ['外姑祖母', '外公'],
    ['外舅祖父', '外婆'], ['外姨祖母', '外婆']
  ];
  SIBLING_OF.forEach(function (p) {
    // 伯祖的父亲就是爷爷的父亲：曾祖父；母亲就是曾祖母
    if (RULES[p[1] + '|父亲'] !== undefined) RULES[p[0] + '|父亲'] = RULES[p[1] + '|父亲'];
    if (RULES[p[1] + '|母亲'] !== undefined) RULES[p[0] + '|母亲'] = RULES[p[1] + '|母亲'];
  });

  /* ===== 姻亲长辈/平辈的子女：与血亲那一支保持一致 =====
     例：伯母的儿子同样是「堂兄弟」；伯母（从丈夫这边论）看我 = 侄子。
     姻亲节点常常先于血亲节点被 BFS 走到，把这一层补齐，「她 → 我」也是正名。 */
  var SPOUSE_SIDE_KIDS = [
    ['伯母', '堂兄弟', '堂姐妹'], ['婶婶', '堂兄弟', '堂姐妹'],
    ['姑父', '表兄弟', '表姐妹'], ['舅妈', '表兄弟', '表姐妹'], ['姨父', '表兄弟', '表姐妹'],
    ['嫂子', '侄子', '侄女'], ['弟媳', '侄子', '侄女'],
    ['姐夫', '外甥', '外甥女'], ['妹夫', '外甥', '外甥女'],
    ['儿媳', '孙子', '孙女'], ['女婿', '外孙', '外孙女'],
    ['大伯子', '侄子', '侄女'], ['小叔子', '侄子', '侄女'],
    ['大姑子', '外甥', '外甥女'], ['小姑子', '外甥', '外甥女'],
    ['内兄', '内侄', '内侄女'], ['内弟', '内侄', '内侄女'],
    ['姨姐', '姨甥', '姨甥女'], ['姨妹', '姨甥', '姨甥女']
  ];
  SPOUSE_SIDE_KIDS.forEach(function (row) {
    var rule = byGender(row[1], row[2]);
    RULES[row[0] + '|儿子'] = rule;
    RULES[row[0] + '|女儿'] = rule;
  });

  /* ===== 反向称谓（顺着关系边的反方向走时用） ===== */
  var INV = {
    '父亲': function (n) { return gendered(n, '儿子', '女儿', '儿女'); },
    '母亲': function (n) { return gendered(n, '儿子', '女儿', '儿女'); },
    '祖父': function (n) { return gendered(n, '孙子', '孙女', '孙辈'); },
    '奶奶': function (n) { return gendered(n, '孙子', '孙女', '孙辈'); },
    '大婆': function (n) { return gendered(n, '孙子', '孙女', '孙辈'); },
    '爷爷': function (n) { return gendered(n, '孙子', '孙女', '孙辈'); },
    '外公': function (n) { return gendered(n, '外孙', '外孙女', '外孙辈'); },
    '外婆': function (n) { return gendered(n, '外孙', '外孙女', '外孙辈'); },
    '儿子': function (n) { return gendered(n, '父亲', '母亲', '父/母'); },
    '女儿': function (n) { return gendered(n, '父亲', '母亲', '父/母'); },
    '配偶': function () { return '配偶'; },
    '哥哥': function (n) { return gendered(n, '弟弟', '妹妹', '弟/妹'); },
    '弟弟': function (n) { return gendered(n, '哥哥', '姐姐', '兄/姐'); },
    '姐姐': function (n) { return gendered(n, '弟弟', '妹妹', '弟/妹'); },
    '妹妹': function (n) { return gendered(n, '哥哥', '姐姐', '兄/姐'); },
    '伯父': function (n) { return gendered(n, '侄子', '侄女', '侄辈'); },
    '叔父': function (n) { return gendered(n, '侄子', '侄女', '侄辈'); },
    '姑姑': function (n) { return gendered(n, '侄子', '侄女', '侄辈'); },
    '舅舅': function (n) { return gendered(n, '外甥', '外甥女', '外甥辈'); },
    '姨妈': function (n) { return gendered(n, '外甥', '外甥女', '外甥辈'); },
    /* ---- 以下是「关系表单里能选的其余类型」的逆称 ----
       少一条，反着录入（例如「我 是 爷爷 的 孙子」）的关系就只能单向推算：
       对方怎么叫我推得出来，我怎么叫他推不出来。 */
    '堂兄弟': function (n) { return gendered(n, '堂兄弟', '堂姐妹', '堂兄弟/堂姐妹'); },
    '表亲': function (n) { return gendered(n, '表兄弟', '表姐妹', '表兄弟/表姐妹'); },
    '侄子': function () { return '伯父/叔父'; },
    '侄女': function () { return '伯父/叔父'; },
    '外甥': function () { return '舅舅/姨妈'; },
    '外甥女': function () { return '舅舅/姨妈'; },
    '孙子': function (n) { return gendered(n, '爷爷', '奶奶', '爷爷/奶奶'); },
    '孙女': function (n) { return gendered(n, '爷爷', '奶奶', '爷爷/奶奶'); },
    '外孙': function (n) { return gendered(n, '外公', '外婆', '外公/外婆'); },
    '外孙女': function (n) { return gendered(n, '外公', '外婆', '外公/外婆'); },
    '岳父': function () { return '女婿'; },
    '岳母': function () { return '女婿'; },
    '公公': function () { return '儿媳'; },
    '婆婆': function () { return '儿媳'; }
  };

  /* ===== 别称查询 ===== */

  // 「配偶」没有固定叫法，按对方性别给：丈夫 / 妻子
  function aliasFor(label, person) {
    if (label === '配偶') {
      if (person && person.gender === 'm') return ['丈夫', '老公'];
      if (person && person.gender === 'f') return ['妻子', '老婆'];
      return ['丈夫/妻子'];
    }
    var t = TERMS[label];
    return t && t.alias ? t.alias.slice() : [];
  }

  function resolveRule(key, person, ego) {
    if (!Object.prototype.hasOwnProperty.call(RULES, key)) return null;
    var r = RULES[key];
    if (typeof r === 'function') return r(person, ego);
    return r;
  }

  // 复合称谓（「伯父/叔父」「爷爷/奶奶」）继续往下推时逐个备选试规则，
  // 免得一条链因为「不知道是伯还是叔」就断掉、退化成一长串路径。
  function alternatives(label) {
    return label.indexOf('/') < 0 ? [label] : [label].concat(label.split('/'));
  }

  function resolveRuleVariant(curKey, word, person, ego) {
    var keys = alternatives(curKey);
    var words = alternatives(word);
    for (var i = 0; i < keys.length; i++) {
      for (var j = 0; j < words.length; j++) {
        var r = resolveRule(keys[i] + '|' + words[j], person, ego);
        if (r !== null) return r;
      }
    }
    return null;
  }

  // 反向互称时常走到「爷爷的儿子」这类链。因为父母已经在链里出现过，
  // 这个儿子不可能是「我」的父亲，只能是伯父/叔父（母系则为舅舅/姨妈）。
  // 只有「爷爷」是孤立的第一跳、链里没有父母时才不强制，保留关系库的候选。
  function uncleFromGrandparent(path, curKey, word) {
    if (!path || !curKey) return null;
    if (path.indexOf('父亲') < 0 && path.indexOf('母亲') < 0) return null;
    var paternal;
    if (curKey === '爷爷' || curKey === '奶奶') paternal = true;
    else if (curKey === '外公' || curKey === '外婆') paternal = false;
    else return null;
    if (word === '儿子') return paternal ? '伯父/叔父' : '舅舅';
    if (word === '女儿') return paternal ? '姑姑' : '姨妈';
    return null;
  }

  function inverseWord(type, person) {
    if (!Object.prototype.hasOwnProperty.call(INV, type)) return null;
    return INV[type](person);
  }

  // 可选的外部称谓兜底（浏览器里由 kinship-external.js 注入 relationship.js）。
  // 只在本项目规则推不出正名时调用，不替换已有正名。
  var externalResolver = null;

  function setExternalResolver(fn) {
    externalResolver = typeof fn === 'function' ? fn : null;
  }

  // 本项目约定：关系链算出的曾祖辈（曾/高/天/烈/太/远/鼻祖）显示时统一降为爷爷辈，
  // 「曾外祖母」也显示成「奶奶」（不再区分外系曾祖）。只改显示/称谓，不改 gen 计算。
  // 本项目家族：父亲这边按和父亲比的排行叫，名字含「爹」的男性一律显示伯父
  // （关系边可能把它推成父亲/姑姑等，这里只在推错时覆盖）。
  function normalizeElderTitle(label, person) {
    var s = String(label == null ? '' : label).trim();
    var nm = person && person.name ? String(person.name) : '';
    if (/爹/.test(nm) && (!person || person.gender !== 'f')) {
      return s === '伯父' ? s : '伯父';
    }
    if (!s) return label;
    // 只规范正名，不碰「A的B」这类路径称谓
    if (/祖[父母]?$|祖母$|祖父$/.test(s) && /^(曾|高|天|烈|太|远|鼻|外曾|曾外|外高|外天)/.test(s)) {
      return /母$/.test(s) ? '奶奶' : '爷爷';
    }
    if (/^(曾祖母|曾祖父|曾外祖母|曾外祖父|外曾祖母|外曾祖父|高祖母|高祖父)$/.test(s)) {
      return /母$/.test(s) ? '奶奶' : '爷爷';
    }
    return label;
  }

  // 规范化 + 本项目显示约定（曾祖辈降为爷爷/奶奶、名字含「爹」强制伯父）。
  function normalizeLabel(label, person) {
    var s = String(label == null ? '' : label).trim();
    if (!s) return s;
    // 本项目：名字就叫「大婆」的人，称谓按原值显示，不转成正名「奶奶」
    var nm = person && person.name ? String(person.name).trim() : '';
    if (nm === '大婆' || s === '大婆') return s;
    if (s.indexOf('/') < 0) return normalizeElderTitle(canonicalTitle(s), person);
    var out = [];
    s.split('/').forEach(function (part) {
      var t = normalizeElderTitle(canonicalTitle(part), person);
      if (t && out.indexOf(t) < 0) out.push(t);
    });
    return out.join('/');
  }

  // relationship.js 对「父亲的儿子」会给「哥哥/弟弟」两个候选；本项目的叫法是
  // 「兄弟」。成对出现时合并，避免界面上出现一长串候选。
  function collapseKinTitles(list) {
    var out = [];
    var set = {};
    list.forEach(function (t) {
      if (!t || set[t]) return;
      set[t] = true;
      out.push(t);
    });
    function pair(a, b, group) {
      if (!set[a] || !set[b]) return;
      out = out.filter(function (t) { return t !== a && t !== b; });
      delete set[a];
      delete set[b];
      if (!set[group]) {
        set[group] = true;
        out.push(group);
      }
    }
    pair('哥哥', '弟弟', '兄弟');
    pair('姐姐', '妹妹', '姐妹');
    if (set['兄弟'] && set['姐妹']) {
      out = out.filter(function (t) { return t !== '兄弟' && t !== '姐妹'; });
      delete set['兄弟'];
      delete set['姐妹'];
      set['兄弟姐妹'] = true;
      out.push('兄弟姐妹');
    }
    return out;
  }

  function aliasForLabel(label, person) {
    var out = [];
    String(label).split('/').forEach(function (part) {
      aliasFor(part, person).forEach(function (a) {
        if (a && a !== label && out.indexOf(a) < 0) out.push(a);
      });
    });
    return out;
  }

  // 在 relationship.js 给出的候选集里选显示称谓：
  // 本地规则算出的正名如果就在候选集里，优先用它（家族习惯/上下文更准）；
  // 否则把候选并起来（如「堂伯/堂叔」），不擅自丢掉一种可能。
  function pickTitle(candidates, localLabel, localExact) {
    if (!candidates.length) return null;
    if (localExact && localLabel && labelInCandidates(localLabel, candidates)) {
      return localLabel;
    }
    return candidates.join('/');
  }

  function labelInCandidates(label, candidates) {
    var parts = String(label == null ? '' : label).split('/');
    for (var i = 0; i < parts.length; i++) {
      if (candidates.indexOf(parts[i]) < 0) return false;
    }
    return parts.length > 0;
  }

  // relationship.js 对「父亲的儿子的儿子」会同时给「侄子/儿子」：它不知道中间
  // 那个儿子不可能是「我」本人。显示上本地正名已经能定成侄子，这类过宽的
  // 亲属词就不再放进别名，避免搜索「儿子」搜出侄子。
  var VAGUE_EXT_ALIAS = {
    '儿子': 1, '女儿': 1, '子女': 1, '父母': 1, '父亲': 1, '母亲': 1,
    '配偶': 1, '丈夫': 1, '妻子': 1, '老公': 1, '老婆': 1
  };

  function compute(rootId, persons, relations) {
    var labels = {};
    var viaRel = {};
    var pmap = {};
    persons.forEach(function (p) { pmap[p.id] = p; });

    if (!rootId || !pmap[rootId]) {
      return { labels: labels, viaRel: viaRel, egoId: null };
    }

    var ego = pmap[rootId];
    labels[rootId] = { label: '我', exact: true, external: false, path: [], gen: 0, key: '我', alias: [] };
    var queue = [rootId];

    // relationship.js 单次换算约几毫秒。大族谱超过预算后，已有正名的节点
    // 不再逐条询问（本地正名本来就够用）；没有正名的节点仍然问，保证能算出来。
    var extStart = Date.now ? Date.now() : new Date().getTime();
    var extBudget = 300;

    while (queue.length) {
      var cid = queue.shift();
      var cur = labels[cid];

      relations.forEach(function (r, ri) {
        var nid, word, firstHop, d;
        if (r.to === cid && pmap[r.from]) {
          nid = r.from;
          word = r.type;
          firstHop = cid === rootId;
          d = delta(r.type);
        } else if (r.from === cid && pmap[r.to]) {
          nid = r.to;
          word = inverseWord(r.type, pmap[nid]);
          if (word === null) return;
          firstHop = cid === rootId;
          d = -delta(r.type);
        } else {
          return;
        }
        if (labels[nid]) return;

        // 原始关系链：不再拿上一步的称谓去压缩，relationship.js 需要完整的
        // 「父亲的哥哥的儿子」才能给出准确换算。
        var path = cur.path.concat([word]);
        var gen = cur.gen + d;

        // 本地规则只做三件事：直接关系、候选集里的家族叫法、relationship.js
        // 不认识的词（如表亲）的兜底；不再是称谓的唯一来源。
        var localExact, localLabel;
        var uncle = firstHop ? null : uncleFromGrandparent(cur.path, cur.key, word);
        if (firstHop) {
          localExact = true;
          localLabel = normalizeLabel(word, pmap[nid]);
        } else if (uncle) {
          localExact = true;
          localLabel = normalizeLabel(uncle, pmap[nid]);
        } else if (cur.key) {
          var resolved = resolveRuleVariant(cur.key, word, pmap[nid], ego);
          if (resolved !== null) {
            localExact = true;
            localLabel = normalizeLabel(resolved, pmap[nid]);
          } else {
            localExact = false;
            localLabel = path.join('的');
          }
        } else {
          localExact = false;
          localLabel = path.join('的');
        }

        var label = localLabel;
        var exact = localExact;
        var external = false;
        var extTitles = null;

        // 直接关系是用户明确选的类型，不换算；多跳才交给 relationship.js。
        var now = Date.now ? Date.now() : new Date().getTime();
        var overBudget = now - extStart > extBudget;
        if (!firstHop && externalResolver && (!localExact || !overBudget)) {
          try {
            extTitles = externalResolver(path, pmap[nid], ego, !localExact);
          } catch (e) { extTitles = null; }

          if (extTitles && extTitles.length) {
            var candidates = [];
            extTitles.forEach(function (t) {
              var n = normalizeLabel(t, pmap[nid]);
              if (n && candidates.indexOf(n) < 0) candidates.push(n);
            });
            candidates = collapseKinTitles(candidates);

            // 本地正名不在候选集里：再带链式校验问一次，防止 relationship.js
            // 把「孙子的堂兄弟」截断成「孙子」。
            if (localExact && !labelInCandidates(localLabel, candidates)) {
              var guarded = null;
              try { guarded = externalResolver(path, pmap[nid], ego, true); } catch (e) { guarded = null; }
              var guardedList = [];
              (guarded || []).forEach(function (t) {
                var n = normalizeLabel(t, pmap[nid]);
                if (n && guardedList.indexOf(n) < 0) guardedList.push(n);
              });
              guardedList = collapseKinTitles(guardedList);
              extTitles = guarded || [];
              candidates = guardedList;
            }

            var picked = pickTitle(candidates, localLabel, localExact);
            if (picked) {
              label = picked;
              exact = true;
              external = true;
            }
          }
        }

        // 别名：候选集里没选中的叫法 + 本项目词表里的俗称。
        var aliases = [];
        if (external && extTitles && extTitles.length) {
          extTitles.forEach(function (t) {
            var n = normalizeLabel(t, pmap[nid]);
            if (n && n !== label && label.split('/').indexOf(n) < 0 && !VAGUE_EXT_ALIAS[n] && aliases.indexOf(n) < 0) aliases.push(n);
          });
        }
        aliasForLabel(label, pmap[nid]).forEach(function (a) {
          if (a !== label && aliases.indexOf(a) < 0) aliases.push(a);
        });

        labels[nid] = {
          label: label,
          exact: exact,
          external: external,
          path: path,
          gen: gen,
          key: localExact ? localLabel : null,
          alias: aliases
        };
        viaRel[nid] = ri;
        queue.push(nid);
      });
    }

    return { labels: labels, viaRel: viaRel, egoId: rootId };
  }

  function computePathEdges(result, relations, personId) {
    var edges = [];
    var nodes = {};
    var id = personId;
    if (result.labels[personId]) nodes[personId] = true;
    var guard = 0;
    while (id !== null && result.viaRel[id] !== undefined && guard++ < 100) {
      var ri = result.viaRel[id];
      edges.push(ri);
      var r = relations[ri];
      var parent = r.to;
      if (parent === id) parent = r.from;
      nodes[parent] = true;
      id = parent;
    }
    if (result.egoId) nodes[result.egoId] = true;
    return { edges: edges, nodes: nodes };
  }

  function displayTitle(person, result) {
    if (result && result.labels[person.id] && result.labels[person.id].exact) {
      return result.labels[person.id].label;
    }
    var titles = person.titles || [];
    if (titles.length) return titles.join(' / ');
    if (result && result.labels[person.id]) return result.labels[person.id].label;
    return '';
  }

  // 双向称谓换算：iCall = root 对 other 的称呼（root 视角），theyCall = other 对 root 的称呼。
  // 两个方向各自独立跑一次 BFS 最短链，间接（多级关系链）人物同样适用；
  // 未连通或 id 未标记时对应方向为 null。genDiff = other 相对 root 的辈分代差：
  // 正数 = other 低 root 几辈（孙辈方向），负数 = other 高 root 几辈（父辈/祖辈方向），
  // 双方未连通时为 null。用于「年龄相近但辈分不同」时明确称呼归属。
  function mutual(rootId, otherId, persons, relations) {
    if (!rootId || !otherId) return { iCall: null, theyCall: null, genDiff: null };
    if (rootId === otherId) {
      var self = { label: '我', exact: true, external: false, path: [], gen: 0, key: '我', alias: [] };
      return { iCall: self, theyCall: self, genDiff: 0 };
    }
    var fwd = compute(rootId, persons, relations);
    var rev = compute(otherId, persons, relations);
    var iCall = fwd.labels[otherId] || null;
    return {
      iCall: iCall,
      theyCall: rev.labels[rootId] || null,
      genDiff: iCall ? iCall.gen : null
    };
  }

  function namesOf(label) {
    return [label].concat(aliasFor(label, null));
  }

  /* ===================================================================
   * 反向建网：按「相对我的称谓」反推关系边（关系图的「补齐关系网」）
   *
   * 数据里每个称谓都是相对「我」叫的（爷爷 / 爸爸 / 23公 / 秀姑…），
   * 这一节把这些称谓反查回规则表，自动补出人与人之间的关系边：
   *   · 只新增，不改动已有关系；
   *   · 称谓前的数字是排行（"23公" = 这一辈里排第 23），同辈之间
   *     用它定长幼（哥哥/弟弟），关系图里同辈也按排行从左到右排；
   *   · 优先挂在已有中间人下面（爷爷挂爸爸、舅舅挂妈妈），关系图画出来
   *     是正经世系线；中间人不存在时才直接挂在「我」下面。
   * =================================================================== */

  var CN_DIGITS = {
    '〇': 0, '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9
  };

  function cnToInt(s) {
    var total = 0, cur = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (CN_DIGITS[c] !== undefined) cur = CN_DIGITS[c];
      else if (c === '十') { total += (cur || 1) * 10; cur = 0; }
      else if (c === '廿') { total += 20; cur = 0; }
      else if (c === '卅') { total += 30; cur = 0; }
    }
    return total + cur;
  }

  // 拆排行前缀："23公" → {rank:23, base:"公"}、"五十姨" → {rank:50, base:"姨"}。
  // "二丫"/"23" 这类名字不算排行（中文数字必须含 十/廿/卅 才认）。
  function splitRank(name) {
    var s = String(name == null ? '' : name).trim();
    if (!s) return { rank: null, base: '' };
    var m = /^第?(\d+)/.exec(s);
    if (m && s.length > m[0].length) return { rank: parseInt(m[1], 10), base: s.slice(m[0].length) };
    var cm = /^第?([〇零一二三四五六七八九十廿卅两]+)/.exec(s);
    if (cm && s.length > cm[0].length && /[十廿卅]/.test(cm[1])) {
      return { rank: cnToInt(cm[1]), base: s.slice(cm[0].length) };
    }
    return { rank: null, base: s };
  }

  // 排行（"23公" → 23；没有排行前缀返回 null）
  // 「大X」= 同辈里最大的（大婆 = 奶奶辈最大），排行按 0，排最前
  function rankOf(name) {
    var s = String(name == null ? '' : name).trim();
    if (/^大[公婆爷奶叔伯姑舅姨哥姐弟妹亲]/.test(s)) return 0;
    return splitRank(name).rank;
  }

  // 称谓定世：认「祖辈称谓」，供关系图在关系边缺失/推错时兜底。
  // 称谓都是相对「我」叫的，返回的代数就是相对根的偏移。
  // 本项目约定：爷爷辈及更远的直系尊亲（曾/高/天/烈/太/远/鼻祖）都按上两代(-2)归一世。
  function titleDelta(title) {
    var t = String(title == null ? '' : title).trim();
    if (!t) return null;
    if (TYPE_DELTA[t] !== undefined) return TYPE_DELTA[t];
    var keys = Object.keys(TERMS);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var al = TERMS[k].alias || [];
      if (k === t || al.indexOf(t) >= 0) {
        if (TYPE_DELTA[k] !== undefined) return TYPE_DELTA[k];
        // 曾祖辈及更远：称谓或别名含「曾/高/天/烈/太/远/鼻 + 祖」的，按爷爷辈 -2
        if (/^(曾|高|天|烈|太|远|鼻|外曾|曾外|外高|外天)/.test(t) && /祖/.test(t)) return -2;
        if (/^(曾|高|天|烈|太|远|鼻|外曾|曾外)/.test(k) && /祖/.test(k)) return -2;
      }
    }
    return null;
  }

  // 去掉排行前缀后的称谓（"23公" → "公"）
  function baseTitle(name) { return splitRank(name).base; }

  // 称谓匹配强度：3=完全一致 2=俗称一致 1=前后缀近似（"公"≈"阿公"）
  // 0.5=尾字近似（"秀姑"≈"姑姑"） 0=不匹配
  function matchStrength(label, target) {
    if (!label || !target) return 0;
    target = String(target).trim();
    if (!target) return 0;
    var best = 0;
    function affix(a, b) {
      var lo = a.length <= b.length ? a : b;
      var hi = a.length <= b.length ? b : a;
      return lo.length > 0 && hi.length - lo.length <= 1 &&
        (hi.lastIndexOf(lo) === 0 || hi.indexOf(lo) === hi.length - lo.length);
    }
    alternatives(label).forEach(function (v) {
      if (!v) return;
      if (v === target) { if (3 > best) best = 3; return; }
      var aliases = aliasFor(v, null);
      for (var i = 0; i < aliases.length; i++) {
        if (aliases[i] === target) best = Math.max(best, 2);
      }
      if (best < 1 && affix(v, target)) best = 1;
      if (best < 1) {
        for (var j = 0; j < aliases.length; j++) {
          if (affix(aliases[j], target)) { best = 1; break; }
        }
      }
      // 尾字近似：昵称常见「修饰字 + 称谓」（秀姑/干姑），拿尾字兜底
      if (best < 0.5 && target.length >= 2) {
        var tail = target.charAt(target.length - 1);
        var all = [v].concat(aliases);
        for (var k = 0; k < all.length; k++) {
          if (all[k] && all[k].charAt(all[k].length - 1) === tail) { best = 0.5; break; }
        }
      }
    });
    return best;
  }

  var SIBLING_WORDS = { '哥哥': 1, '弟弟': 1, '姐姐': 1, '妹妹': 1 };
  var OLDER_WORDS = { '哥哥': 1, '姐姐': 1 };

  // 自动补齐关系网：为还没连进「我」的关系网的人反推关系边。
  // 返回新增关系数组（{from, to, type}：from 是 to 的 type），只增不改。
  function buildRelations(persons, relations, rootId) {
    if (!persons || !persons.length || !rootId) return [];
    var pmap = {};
    persons.forEach(function (p) { pmap[p.id] = p; });
    if (!pmap[rootId]) return [];

    var rels = (relations || []).slice();
    var added = [];
    var labels = {};
    function recompute() { labels = compute(rootId, persons, rels).labels; }
    recompute();

    // 第一跳可直接用的关系词：关系表单里能选的类型（代际已知）
    var directWords = [];
    TYPE_GROUPS.forEach(function (g) {
      g.types.forEach(function (t) { if (directWords.indexOf(t) < 0) directWords.push(t); });
    });
    // 第二跳起把规则表里出现过的关系词都试一遍
    var vocab = directWords.slice();
    Object.keys(RULES).forEach(function (key) {
      var w = key.split('|')[1];
      if (w && vocab.indexOf(w) < 0) vocab.push(w);
    });

    function hasLink(a, b) {
      for (var i = 0; i < rels.length; i++) {
        var r = rels[i];
        if ((r.from === a && r.to === b) || (r.from === b && r.to === a)) return true;
      }
      return false;
    }

    // 某人的某个目标称谓的全部候选边
    function candidatesFor(p, target) {
      var out = [];
      directWords.forEach(function (w) {
        var s = matchStrength(w, target);
        if (s > 0 && !hasLink(p.id, rootId)) {
          out.push({ edge: { from: p.id, to: rootId, type: w }, strength: s, hops: 1, resolved: w });
        }
      });
      persons.forEach(function (q) {
        if (q.id === p.id || q.id === rootId || hasLink(p.id, q.id)) return;
        var lab = labels[q.id];
        if (!lab || !lab.exact || !lab.key) return;
        vocab.forEach(function (w) {
          var resolved = resolveRuleVariant(lab.key, w, p, pmap[rootId]);
          if (resolved === null) return;
          var s = matchStrength(resolved, target);
          if (s > 0) out.push({ edge: { from: p.id, to: q.id, type: w }, strength: s, hops: 2, qid: q.id, resolved: resolved });
        });
      });
      return out;
    }

    // 选边：匹配强度 > 跳数多（挂到中间人下面，世系线更正） > 排行定长幼
    function pickBest(list, p) {
      if (!list.length) return null;
      var best = null;
      list.forEach(function (c) {
        if (!best || c.strength > best.strength ||
            (c.strength === best.strength && c.hops > best.hops)) best = c;
      });
      // 排行只在「并列候选全是同一个人的兄弟姐妹词、推出来还是同一称谓」时用——
      // 否则会把「奶奶」和「姑祖母」这种不同称谓的并列瞎分长幼
      var tied = list.filter(function (c) {
        return c.strength === best.strength && c.hops === best.hops;
      });
      if (tied.length > 1) {
        var sib = tied.filter(function (c) { return SIBLING_WORDS[c.edge.type]; });
        var allSib = sib.length > 1 && sib.length === tied.length &&
          sib.every(function (c) { return c.qid === sib[0].qid && c.resolved === sib[0].resolved; });
        if (allSib) {
          var pr = rankOf(p.name);
          var qr = sib[0].qid ? rankOf(pmap[sib[0].qid].name) : null;
          if (pr != null && qr != null) {
            var older = pr < qr;
            for (var i = 0; i < sib.length; i++) {
              if (!!OLDER_WORDS[sib[i].edge.type] === older) return sib[i];
            }
          }
        }
      }
      return best;
    }

    var guard = 0;
    var progress = true;
    while (progress && guard++ < persons.length + 2) {
      progress = false;
      persons.forEach(function (p) {
        if (p.id === rootId || labels[p.id]) return;
        // 目标称谓：条目名（剥掉排行前缀）+ 历史手填 titles（未拆的老数据）
        var targets = [];
        function addTarget(v) {
          v = String(v == null ? '' : v).trim();
          if (!v) return;
          var b = baseTitle(v);
          if (b && targets.indexOf(b) < 0) targets.push(b);
          if (targets.indexOf(v) < 0) targets.push(v);
        }
        addTarget(p.name);
        (p.titles || []).forEach(addTarget);
        var best = null;
        targets.forEach(function (t) {
          var pick = pickBest(candidatesFor(p, t), p);
          if (pick && (!best || pick.strength > best.strength)) best = pick;
        });
        if (best) {
          rels.push(best.edge);
          added.push(best.edge);
          recompute();
          progress = true;
        }
      });
    }
    return added;
  }

  global.Kinship = {
    TYPE_GROUPS: TYPE_GROUPS,
    TERMS: TERMS,
    typeGroup: typeGroup,
    delta: delta,
    compute: compute,
    setExternalResolver: setExternalResolver,
    canonicalTitle: canonicalTitle,
    computePathEdges: computePathEdges,
    displayTitle: displayTitle,
    mutual: mutual,
    aliasOf: function (label) { return aliasFor(label, null); },
    namesOf: namesOf,
    rankOf: rankOf,
    titleDelta: titleDelta,
    baseTitle: baseTitle,
    matchStrength: matchStrength,
    buildRelations: buildRelations
  };
})(typeof window !== 'undefined' ? window : globalThis);