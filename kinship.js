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

  var typeGroup = {};
  TYPE_GROUPS.forEach(function (g) {
    g.types.forEach(function (t) { typeGroup[t] = g.group; });
  });

  function delta(type) {
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
    '奶奶': { alias: ['祖母', '阿婆'] },
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
    '伯父': { alias: ['伯伯', '大伯', '大爷'] },
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
    ['爷爷', '奶奶'], ['外公', '外婆'],
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

  function inverseWord(type, person) {
    if (!Object.prototype.hasOwnProperty.call(INV, type)) return null;
    return INV[type](person);
  }

  function compute(rootId, persons, relations) {
    var labels = {};
    var viaRel = {};
    var pmap = {};
    persons.forEach(function (p) { pmap[p.id] = p; });

    if (!rootId || !pmap[rootId]) {
      return { labels: labels, viaRel: viaRel, egoId: null };
    }

    var ego = pmap[rootId];
    labels[rootId] = { label: '我', exact: true, path: [], gen: 0, key: '我', alias: [] };
    var queue = [rootId];

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

        var basePath = cur.exact ? [cur.label] : cur.path;
        var path = basePath.concat([word]);
        var gen = cur.gen + d;
        var exact, label;

        if (firstHop) {
          exact = true;
          label = word;
        } else if (cur.key) {
          var resolved = resolveRuleVariant(cur.key, word, pmap[nid], ego);
          if (resolved !== null) {
            exact = true;
            label = resolved;
          } else {
            exact = false;
            label = path.join('的');
          }
        } else {
          exact = false;
          label = path.join('的');
        }

        labels[nid] = {
          label: label,
          exact: exact,
          path: path,
          gen: gen,
          key: exact ? label : null,
          alias: exact ? aliasFor(label, pmap[nid]) : []
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
      var self = { label: '我', exact: true, path: [], gen: 0, key: '我', alias: [] };
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

  global.Kinship = {
    TYPE_GROUPS: TYPE_GROUPS,
    TERMS: TERMS,
    typeGroup: typeGroup,
    delta: delta,
    compute: compute,
    computePathEdges: computePathEdges,
    displayTitle: displayTitle,
    mutual: mutual,
    aliasOf: function (label) { return aliasFor(label, null); },
    namesOf: namesOf
  };
})(typeof window !== 'undefined' ? window : globalThis);