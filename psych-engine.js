/**
 * psych-engine.js — 심리테스트 채점 엔진 (인생확언 앱에서 추출, 순수 함수화)
 * ------------------------------------------------------------------------
 * 의존: psych-data.js (PSYCH_ANIMALS, BFI_ITEMS, RSE_ITEMS, VIA_ITEMS,
 *                       INFO_ITEMS, ANIMAL_FACET_MAP, *_SHORT)
 *
 * 핵심 API:
 *   PsychEngine.calcResult(answers, mode)  → 결과 객체 반환 (DOM/시트 부작용 없음)
 *   PsychEngine.getQuestions(mode)         → 순서대로 정렬된 문항 배열
 *   PsychEngine.getTotal(mode)             → 총 문항 수
 *
 * answers 형식: { 'bfi_E1': 5, 'rse_R1': 3, 'via_V1': 2, 'info_age': '40대', ... }
 *   - BFI/RSE: 1~7 (리커트)
 *   - VIA: 0~N (선택지 인덱스)
 *   - mode: 'full' | 'quick'
 */
(function (global) {
  'use strict';

  // ── 모드별 문항 선택 ──
  function getBFI(mode){ return mode === 'quick' ? BFI_ITEMS_SHORT : BFI_ITEMS; }
  function getRSE(mode){ return mode === 'quick' ? RSE_ITEMS_SHORT : RSE_ITEMS; }
  function getVIA(mode){ return mode === 'quick' ? VIA_ITEMS_SHORT : VIA_ITEMS; }

  function getTotal(mode){
    return INFO_ITEMS.length + getBFI(mode).length + getRSE(mode).length + getVIA(mode).length;
  }

  // ── 문항 순서 배열 (INFO → BFI → RSE → VIA) ──
  function getQuestions(mode){
    return {
      info: INFO_ITEMS,
      bfi:  getBFI(mode),
      rse:  getRSE(mode),
      via:  getVIA(mode)
    };
  }

  // ── 변형(A/B/C/D) 설명 — 모든 상세 필드 통합 ──
  function getVariantDescription(animalEmoji, variantKey) {
    if (typeof ANIMAL_FACET_MAP === 'undefined' || !ANIMAL_FACET_MAP[animalEmoji]) return null;
    var facetEntry = ANIMAL_FACET_MAP[animalEmoji];
    var variants   = facetEntry.variants || {};
    var variant    = variants[variantKey] || variants['A'] || {};
    var animalData = null;
    Object.keys(PSYCH_ANIMALS).forEach(function (k) {
      if (PSYCH_ANIMALS[k].animal === animalEmoji) animalData = PSYCH_ANIMALS[k];
    });
    // 상세 강점/주의점 (STRENGTH_MAP 우선 → 길고 풍부)
    var sm = (typeof ANIMAL_STRENGTH_MAP !== 'undefined') ? ANIMAL_STRENGTH_MAP[animalEmoji] : null;
    var strengths = (sm && sm.strengths && sm.strengths.length) ? sm.strengths : (animalData ? (animalData.strengths || []) : []);
    var cautions  = (sm && sm.cautions  && sm.cautions.length)  ? sm.cautions  : (animalData ? (animalData.cautions  || []) : []);
    // 닮은 위인 (EXTRA_CELEBS[emoji+variantKey] 우선 → 3명+설명)
    var celebs = [];
    if (typeof EXTRA_CELEBS !== 'undefined' && EXTRA_CELEBS[animalEmoji + variantKey]) {
      celebs = EXTRA_CELEBS[animalEmoji + variantKey];
    } else if (variant.celebs && variant.celebs.length) {
      celebs = variant.celebs;
    } else if (animalData && animalData.celebrities) {
      celebs = animalData.celebrities;
    }
    return {
      label:        variant.label || facetEntry.name,
      mbti:         variant.mbti || (animalData ? animalData.mbti : ''),
      narrative:    animalData ? (animalData.desc || '') : '',
      strength:     variant.strength || '',
      weakness:     variant.weakness || '',
      growth:       variant.growth || '',
      romance:      variant.romance || '',
      work:         variant.work || '',
      money:        variant.money || '',
      relationship: variant.relationship || '',
      affirmation:  variant.affirmation || '',
      compatible:   variant.compatible || null,
      strengths:    strengths,
      cautions:     cautions,
      celebrities:  celebs
    };
  }

  // ── 정밀 MBTI (페이싯 기반, BFI 점수와 독립) ──
  function calcAccurateMBTI(af, mode) {
    if (mode === 'quick') return null;
    if (!af) return null;
    var EI  = af.sociability     != null ? af.sociability     : null;
    var NS  = af.intellect       != null ? af.intellect       : null;
    var FT  = af.compassion      != null ? af.compassion      : null;
    var JP  = af.order           != null ? af.order           : null;
    var EI2 = af.assertiveness   != null ? af.assertiveness   : null;
    var NS2 = af.aesthetics      != null ? af.aesthetics      : null;
    var FT2 = af.cooperation     != null ? af.cooperation     : null;
    var JP2 = af.industriousness != null ? af.industriousness : null;
    if (EI===null || NS===null || FT===null || JP===null) return null;
    function decide(primary, secondary, hi, lo) {
      if (primary >= 55) return hi;
      if (primary <= 45) return lo;
      if (secondary !== null) return secondary >= 50 ? hi : lo;
      return primary >= 50 ? hi : lo;
    }
    var ei = decide(EI, EI2, '☀️', '🌙');
    var ns = decide(NS, NS2, '🔥', '🌱');
    var ft = decide(FT, FT2, '🤝', '🧊');
    var jp = decide(JP, JP2, '⚡', '💭');
    return (ei==='☀️'?'E':'I') + (ns==='🔥'?'N':'S') + (ft==='🤝'?'F':'T') + (jp==='⚡'?'J':'P');
  }

  // ── 메인 채점 (순수 함수) ──
  function calcResult(answers, mode) {
    mode = mode || 'full';
    var pA = answers || {};

    // 1. Big 5 채점
    var bfi = { E:[], O:[], A:[], C:[], N:[] };
    getBFI(mode).forEach(function (item) {
      var raw = pA['bfi_'+item.id] || 4;
      if (item.rev) raw = 8 - raw;
      bfi[item.axis].push(raw);
    });
    var scores = {}, rawScores = {};
    ['E','O','A','C','N'].forEach(function (ax) {
      var avg = bfi[ax].reduce(function(a,b){return a+b;},0) / bfi[ax].length;
      scores[ax]    = Math.round((avg-1)/6*100);
      rawScores[ax] = Math.round(avg*100)/100;
    });

    // 2. 동물 판별 (16마리)
    var E = scores.E >= 50 ? '☀️' : '🌙';
    var O = scores.O >= 50 ? '🔥' : '🌱';
    var A = scores.A >= 50 ? '🤝' : '🧊';
    var C = scores.C >= 50 ? '⚡' : '💭';
    var typeKey = E+O+A+C;
    var animalData = PSYCH_ANIMALS[typeKey] || PSYCH_ANIMALS['🌙🌱🤝💭'];

    // 3. Facet 정밀 채점
    function calcFacet(facetName) {
      var items = getBFI(mode).filter(function(it){ return it.facet === facetName; });
      var sum = 0, count = 0;
      items.forEach(function (it) {
        var val = pA['bfi_'+it.id];
        if (val !== undefined) {
          var raw = it.rev ? 8 - val : val;
          sum += raw; count++;
        }
      });
      return count === 0 ? 4 : sum / count;
    }
    var f_compassion      = calcFacet('compassion');
    var f_cooperation     = calcFacet('cooperation');
    var f_industriousness = calcFacet('industriousness');
    var f_order           = calcFacet('order');
    var f_intellect       = calcFacet('intellect');
    var f_aesthetics      = calcFacet('aesthetics');
    var f_sociability     = calcFacet('sociability');
    var f_assertiveness   = calcFacet('assertiveness');
    var f_anxiety         = calcFacet('anxiety');
    var f_volatility      = calcFacet('volatility');

    // 4. 변형(A/B/C/D) 판별
    var variantKey = 'A', facetData = {};
    var animal_emoji = animalData.animal;
    var H1 = 5.5, H2 = 4.0;
    function vk(h1, h2){ return (h1&&h2)?'A':(h1&&!h2)?'B':(!h1&&h2)?'C':'D'; }
    var pct = function(f){ return Math.round((f-1)/6*100); };

    if (['🦁','🐺','🦅','🦫'].indexOf(animal_emoji) >= 0) {
      variantKey = vk(f_order>=H1, f_industriousness>=H2);
      facetData = { l1:'계획/체계', s1:pct(f_order), l2:'성취 지향', s2:pct(f_industriousness) };
    } else if (['🐘','🐋','🦝','🐢'].indexOf(animal_emoji) >= 0) {
      variantKey = vk(f_compassion>=H1, f_cooperation>=H2);
      facetData = { l1:'공감 능력', s1:pct(f_compassion), l2:'협력/조율', s2:pct(f_cooperation) };
    } else if (['🐒','🦊','🦦','🦌'].indexOf(animal_emoji) >= 0) {
      variantKey = vk(f_intellect>=H1, f_aesthetics>=H2);
      facetData = { l1:'지적 탐구', s1:pct(f_intellect), l2:'예술 감수성', s2:pct(f_aesthetics) };
    } else if (['🐯','🐆','🦢','🐱'].indexOf(animal_emoji) >= 0) {
      variantKey = vk(f_sociability>=H1, f_assertiveness>=H2);
      facetData = { l1:'사교성', s1:pct(f_sociability), l2:'주도/통제', s2:pct(f_assertiveness) };
    }

    // 5. 변형 프로필
    var variantProfile = getVariantDescription(animal_emoji, variantKey) || {
      label: animalData.name, narrative: animalData.desc || '',
      strengths: animalData.strengths || [], cautions: animalData.cautions || [], celebrities: []
    };

    // 6. RSE / VIA 채점
    var rseTotal = 0;
    getRSE(mode).forEach(function (item) {
      var raw = pA['rse_'+item.id] || 4;
      if (item.rev) raw = 8 - raw;
      rseTotal += raw;
    });
    var rseLen = getRSE(mode).length;
    scores.RSE = Math.round((rseTotal - rseLen) / (rseLen * 6) * 100);
    var viaStrengths = getVIA(mode).map(function (item) { return item.str[pA['via_'+item.id] || 0]; });

    // 7. 전체 Facet
    var allFacets = {
      sociability:pct(f_sociability), assertiveness:pct(f_assertiveness),
      intellect:pct(f_intellect), aesthetics:pct(f_aesthetics),
      compassion:pct(f_compassion), cooperation:pct(f_cooperation),
      order:pct(f_order), industriousness:pct(f_industriousness),
      anxiety:pct(f_anxiety), volatility:pct(f_volatility)
    };

    // 8. 결과 객체
    var result = {
      typeKey: typeKey, animal: animalData, scores: scores, rawScores: rawScores,
      viaStrengths: viaStrengths, variant: variantProfile, variantKey: variantKey,
      facetData: facetData, allFacets: allFacets,
      pAnswers: Object.assign({}, pA), _mode: mode,
      info: { route: pA['info_route'], age: pA['info_age'], region: pA['info_region'] },
      date: new Date().toISOString().slice(0,10)
    };

    // 9. 정밀 MBTI + 동물 재결정 (full 모드만)
    var mbtiAccurate = calcAccurateMBTI(allFacets, mode);
    if (mbtiAccurate) result.mbtiAccurate = mbtiAccurate;

    if (mbtiAccurate && mode !== 'quick') {
      var MBTI_TO_ANIMAL = {
        'ENTJ':'🦁','INTJ':'🐺','ESTJ':'🦅','ISTJ':'🦫',
        'ENFJ':'🐘','INFJ':'🐋','ESFJ':'🦝','ISFJ':'🐢',
        'ENTP':'🐒','INTP':'🦊','ENFP':'🦦','INFP':'🦌',
        'ESTP':'🐯','ISTP':'🐆','ESFP':'🦢','ISFP':'🐱'
      };
      var accEmoji = MBTI_TO_ANIMAL[mbtiAccurate];
      if (accEmoji && accEmoji !== result.animal.animal) {
        var newAnimal = null;
        Object.keys(PSYCH_ANIMALS).forEach(function (k) {
          if (PSYCH_ANIMALS[k].animal === accEmoji) newAnimal = PSYCH_ANIMALS[k];
        });
        if (newAnimal) {
          var TJ=['🦁','🐺','🦅','🦫'], FJ=['🐘','🐋','🦝','🐢'], NP=['🐒','🦊','🦦','🦌'], SP=['🐯','🐆','🦢','🐱'];
          var nvk='A', nfd={};
          if (TJ.indexOf(accEmoji)>=0)      { nvk=vk(f_order>=H1,f_industriousness>=H2); nfd={l1:'계획/체계',s1:pct(f_order),l2:'성취 지향',s2:pct(f_industriousness)}; }
          else if (FJ.indexOf(accEmoji)>=0) { nvk=vk(f_compassion>=H1,f_cooperation>=H2); nfd={l1:'공감 능력',s1:pct(f_compassion),l2:'협력/조율',s2:pct(f_cooperation)}; }
          else if (NP.indexOf(accEmoji)>=0) { nvk=vk(f_intellect>=H1,f_aesthetics>=H2); nfd={l1:'지적 탐구',s1:pct(f_intellect),l2:'예술 감수성',s2:pct(f_aesthetics)}; }
          else if (SP.indexOf(accEmoji)>=0) { nvk=vk(f_sociability>=H1,f_assertiveness>=H2); nfd={l1:'사교성',s1:pct(f_sociability),l2:'주도/통제',s2:pct(f_assertiveness)}; }
          result._originalTypeKey = result.typeKey;
          result.animal     = newAnimal;
          result.variantKey = nvk;
          result.facetData  = nfd;
          result.variant    = getVariantDescription(accEmoji, nvk) || result.variant;
        }
      }
    }

    return result;
  }

  global.PsychEngine = {
    calcResult: calcResult,
    getQuestions: getQuestions,
    getTotal: getTotal,
    getVariantDescription: getVariantDescription,
    calcAccurateMBTI: calcAccurateMBTI
  };

})(typeof window !== 'undefined' ? window : this);
