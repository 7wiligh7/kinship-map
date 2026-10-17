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
    '姨妈|女儿': function (n) { return gendered(n, '表兄弟', '表姐妹', '表兄弟/表姐妹'); }
  };

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
    '姨妈': function (n) { return gendered(n, '外甥', '外甥女', '外甥辈'); }
  };

  function resolveRule(key, person, ego) {
    if (!Object.prototype.hasOwnProperty.call(RULES, key)) return null;
    var r = RULES[key];
    if (typeof r === 'function') return r(person, ego);
    return r;
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
    labels[rootId] = { label: '我', exact: true, path: [], gen: 0, key: '我' };
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
          var resolved = resolveRule(cur.key + '|' + word, pmap[nid], ego);
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
          key: exact ? label : null
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

  global.Kinship = {
    TYPE_GROUPS: TYPE_GROUPS,
    typeGroup: typeGroup,
    delta: delta,
    compute: compute,
    computePathEdges: computePathEdges,
    displayTitle: displayTitle
  };
})(typeof window !== 'undefined' ? window : globalThis);
