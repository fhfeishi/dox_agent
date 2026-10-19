/**
 * NSFC 项目首页信息抓取工具
 *
 * 从 kd.nsfc.cn（国家自然科学基金大数据知识管理服务门户）抓取结题项目的
 * "项目首页信息"，按 .knowledge 现有 markdown 的格式落成 .md 文件。
 *
 * 数据链路：
 *   1) 搜索  POST /api/baseQuery/completionQueryResultsData
 *      —— 响应体是 DES/ECB/PKCS7 加密后再 base64 的密文，密钥 "IFROMC86"
 *         （取自站点 app.js；DES 属 OpenSSL legacy 算法，Node 17+ 需
 *          --openssl-legacy-provider 才能解密）
 *   2) 详情  POST /api/baseQuery/conclusionProjectInfo/{id}
 *      —— 明文 JSON，含项目信息、中英文摘要、结题摘要与成果列表
 *
 * 用法（默认 dry-run，只打印计划）：
 *   node --openssl-legacy-provider tools/fetch_nsfc_meta.mjs collect
 *   node --openssl-legacy-provider tools/fetch_nsfc_meta.mjs plan
 *   node --openssl-legacy-provider tools/fetch_nsfc_meta.mjs apply
 *
 * 可选参数：
 *   --corpus=名称           只处理指定知识库
 *   --target=100            目标篇数（pdf+md 合计）
 *   --out=<dir>             覆盖输出根（默认 <repo>/.knowledge）
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORPORA_ROOT = path.join(REPO, '.knowledge');
const CACHE = path.join(REPO, 'tools', '.cache', 'nsfc_candidates.json');

const HOST = 'https://kd.nsfc.cn';
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DES_KEY = 'IFROMC86';

const PAGE_SIZE = 10; // 服务端上限，调大也只返回 10 条
const MAX_PAGES = 30; // 单个关键词最多翻多少页
const REQ_DELAY = 700; // ms
const RETRY = 5; // 搜索接口会间歇性返回 404（网关风控），需退避重试
const TARGET = 100;

// ---------------------------------------------------------------- 领域词表

const AI_WORDS = [
  '人工智能', '机器学习', '深度学习', '神经网络', '知识图谱', '影像组学', '病理组学',
  '迁移学习', '强化学习', '联邦学习', '计算机视觉', '自然语言处理', '大模型', '多模态',
  '数据挖掘', '大数据', '图卷积', '图神经网络', '卷积神经', 'Transformer', '生成对抗',
  '智能', '智慧', 'AI', '算法', '数据驱动', '预测模型', '辅助决策', '自动诊断',
  '计算机辅助', '信息融合', '可解释',
];

// 强机器人/自动化词：命中即归机器人方向
const ROBOT_STRONG = [
  '机器人', '机械臂', '机械手', '机械爪', '灵巧手', '无人机', '无人车', '无人艇', '无人船',
  '无人系统', '无人平台', '外骨骼', '自动驾驶', '智能驾驶', '无人驾驶', '仿生', '扑翼',
  '软体机器人', '手术机器人', '康复机器人', '服务机器人', '工业机器人', '特种机器人',
  '协作机器人', '人机协作', '人机交互', '遥操作', '主从控制', '智能制造', '智能装备',
  '智能工厂', '足式', '双足', '四足', '六足', '机器鱼', '机器蛇', 'SLAM', '自主导航',
  '运动规划', '轨迹规划', '运动控制', '力控', '柔顺控制', '抓取', '操作器', '末端执行',
  '集群智能', '群体智能', '编队控制', '柔性驱动', '驱动器', '伺服系统', '并联机构',
];

// 弱自动化词：需与 AI 词共现才归机器人方向
const ROBOT_WEAK = [
  '数控', '生产线', '装配', '焊接', '巡检', '伺服', '舵机', '执行器',
  '传感器网络', '自主系统', '自主控制', '智能控制', '协同控制', '集群', '编队',
];

// 明显属于其它知识库的主题：命中且本域证据不强时丢弃，避免串领域
const OTHER_DOMAIN = [
  '水稻', '小麦', '玉米', '作物', '土壤', '农田', '养殖', '畜禽', '育种', '病虫害',
  '大田', '果园', '水产', '拖拉机', '农机',
  '合金', '电池', '催化', '薄膜', '晶体', '高分子', '陶瓷', '涂层', '纳米材料', '腐蚀',
  '增材制造',
  '电网', '风电', '光伏', '电力系统', '储能', '油藏', '钻井', '石油',
  '桥梁', '隧道', '混凝土', '土木', '道路', '建筑结构', '结构损伤', '建筑设计',
  '地震', '气象', '降雨', '洪水', '滑坡', '地质灾害', '岩石', '边坡',
  '金融', '股票', '消费者', '供应链', '营销', '舆情', '社会治理', '公共政策', '法律',
  'EDA', '版图', '布线', '网络安全',
  '管理学', '研讨会', '学术会议',
];

// 命中即丢弃（与农业/材料/能源/土木/地质/管理等其它知识库直接冲突）
// 命中但本域证据强（>=2 个强机器人词）时仍保留，如"外骨骼机器人+支架"
const SOFT_EXCLUDE = ['支架', '生物材料'];

// 管理学部项目（批准号 7 开头）多为用户行为/产业经济视角，不做机器人/医学语料
const isManagement = (ratifyNo) => /^7/.test(String(ratifyNo || ''));

const MEDICAL_WORDS = [
  '医学', '医疗', '临床', '疾病', '肿瘤', '癌', '瘤', '诊断', '治疗', '疗效', '预后',
  '筛查', '患者', '病人', '病理', '影像', '超声', '磁共振', '放射', '放疗', '化疗',
  '手术', '麻醉', '康复', '护理', '药物', '药理', '药效', '药剂', '药', '疫苗', '抗体',
  '细胞', '基因', '蛋白', '组学', '转录', '衰老', '医院', '中医', '中药', '针灸',
  '心理', '精神', '抑郁', '流行病', '传染', '感染', '病毒', '细菌', '免疫', '血液',
  '血清', '生物标志物', '标志物', '健康', '器官', '脏器', '脑', '肺', '肝', '心',
  '肾', '胃', '肠', '乳腺', '甲状腺', '眼科', '眼', '口腔', '牙', '骨科', '骨',
  '脊柱', '儿科', '儿童', '小儿', '妇科', '产科', '皮肤', '急诊', '重症', '营养',
  '代谢', '糖尿病', '肥胖', '高血压', '卒中', '阿尔茨海默', '帕金森', '癫痫',
  '白内障', '近视', '冠脉', '心血管', '结节', '病灶', '活检', '穿刺', '内镜',
  'CT', 'MRI', 'PET', '心电', '脑电', '体征', '证候', '舌', '脉象', '中医证',
];

const QUERIES = {
  '自然科学基金-AI与医疗': [
    '人工智能', '智能诊断', '智能医疗', '医学人工智能', '医疗人工智能', '影像组学',
    '机器学习', '深度学习', '智能影像', '辅助诊断', '智慧医疗', '智能康复',
    '病理人工智能', '智能筛查', '人工智能辅助', '智能预测模型',
  ],
  '自然科学基金-AI与机器人自动化': [
    '机器人', '智能机器人', '无人机', '无人车', '自动驾驶', '智能制造', '外骨骼',
    '仿生机器人', '软体机器人', '手术机器人', '康复机器人', '人机协作', '机械臂',
    '无人系统', '自主系统', '智能控制', '智能装备', '集群智能', '工业机器人',
    '遥操作', '运动规划', '足式机器人', '智能巡检',
  ],
};

// ---------------------------------------------------------------- HTTP

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decrypt(cipherB64) {
  const d = crypto.createDecipheriv('des-ecb', Buffer.from(DES_KEY, 'utf8'), null);
  return Buffer.concat([
    d.update(Buffer.from(cipherB64, 'base64')),
    d.final(),
  ]).toString('utf8');
}

async function searchOnce(body) {
  const resp = await fetch(`${HOST}/api/baseQuery/completionQueryResultsData`, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json',
      'user-agent': UA,
      referer: `${HOST}/`,
    },
    body: JSON.stringify(body),
  });
  const text = (await resp.text()).trim();
  if (resp.status !== 200 || text.length < 100) {
    throw new Error(`HTTP ${resp.status} len=${text.length}`);
  }
  return JSON.parse(decrypt(text));
}

async function search(keyword, pageNum) {
  const body = {
    code: '', fuzzyKeyword: keyword, complete: true, isFuzzySearch: true,
    conclusionYear: '', dependUnit: '', keywords: '', pageNum, pageSize: PAGE_SIZE,
    personInCharge: '', projectName: '', projectType: '', subPType: '', psPType: '',
    ratifyNo: '', ratifyYear: '', order: 'enddate', ordering: 'desc',
    codeScreening: '', dependUnitScreening: '', keywordsScreening: '',
    projectTypeNameScreening: '',
  };
  let lastErr;
  for (let attempt = 0; attempt < RETRY; attempt++) {
    try {
      const payload = await searchOnce(body);
      if (payload.code !== 200) throw new Error(`搜索失败: ${payload.message}`);
      return payload.data;
    } catch (e) {
      lastErr = e;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw new Error(`${keyword}#${pageNum} 重试 ${RETRY} 次仍失败: ${lastErr.message}`);
}

async function detail(id) {
  let lastErr;
  for (let attempt = 0; attempt < RETRY; attempt++) {
    try {
      const resp = await fetch(`${HOST}/api/baseQuery/conclusionProjectInfo/${id}`, {
        method: 'POST',
        headers: {
          accept: 'application/json, text/plain, */*',
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': UA,
          referer: `${HOST}/`,
        },
        body: '',
      });
      const text = (await resp.text()).trim();
      if (resp.status !== 200 || !text.startsWith('{')) {
        throw new Error(`HTTP ${resp.status} len=${text.length}`);
      }
      const j = JSON.parse(text);
      if (j.code !== 200) throw new Error(`详情失败: ${j.message}`);
      return j.data;
    } catch (e) {
      lastErr = e;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw new Error(`${id} 重试 ${RETRY} 次仍失败: ${lastErr.message}`);
}

// ---------------------------------------------------------------- 分类

// 直接写进标题/关键词的 AI 词，权重高于只出现在正文（由搜索命中推断）的
const AI_STRONG = [
  '人工智能', '机器学习', '深度学习', '神经网络', '知识图谱', '大模型', 'AI',
  '迁移学习', '强化学习', '联邦学习', '计算机视觉', '自然语言处理', '图神经网络',
];
// 只在正文命中、标题未体现的，靠搜索关键词推断
const AI_QUERY_HINT = [
  '人工智能', '机器学习', '深度学习', '医学人工智能', '医疗人工智能', '人工智能辅助',
];

const hitCount = (text, words) =>
  words.reduce((n, w) => (text.includes(w) ? n + 1 : n), 0);

function classify(item) {
  // 领域判定只看项目自身文本；搜索关键词仅作为"正文含 AI 词"的弱证据
  const local = `${item.title} ${item.keywords}`;
  const ai = hitCount(local, AI_WORDS);
  const aiStrong = hitCount(local, AI_STRONG);
  const aiHint = hitCount((item.queries || []).join(' '), AI_QUERY_HINT);
  const med = hitCount(local, MEDICAL_WORDS);
  const strong = hitCount(local, ROBOT_STRONG);
  const weak = hitCount(local, ROBOT_WEAK);
  const aiScore = aiStrong * 10 + aiHint * 5 + ai;
  const other = hitCount(local, OTHER_DOMAIN);
  const soft = hitCount(local, SOFT_EXCLUDE);
  if (isManagement(item.ratifyNo) || other > 0 || (soft > 0 && strong < 2)) return null;
  if (strong > 0) return { domain: 'robot', score: strong * 3 + aiScore + weak };
  if (med > 0 && (ai > 0 || aiHint > 0)) return { domain: 'medical', score: aiScore + med };
  if (weak > 0 && ai > 0) return { domain: 'robot', score: aiScore + weak };
  return null;
}

// ---------------------------------------------------------------- 采集

async function collect() {
  const pool = new Map();
  for (const [corpus, keywords] of Object.entries(QUERIES)) {
    for (const kw of keywords) {
      let page = 0;
      let total = -1;
      let got = 0;
      let fetched = 0;
      while (page < MAX_PAGES) {
        let data;
        try {
          data = await search(kw, page);
        } catch (e) {
          console.error(`  ! ${kw} page${page}: ${e.message}`);
          break;
        }
        const rows = data.resultsData || [];
        total = Number(data.itotalRecords || 0);
        if (!rows.length) break;
        for (const r of rows) {
          const key = r[2]; // ratifyNo
          if (!key) continue;
          if (pool.has(key)) {
            const prev = pool.get(key);
            if (!prev.queries.includes(kw)) prev.queries.push(kw);
            continue;
          }
          pool.set(key, {
            id: r[0],
            title: r[1],
            ratifyNo: r[2],
            projectTypeName: r[3],
            dependUnit: r[4],
            admin: r[5],
            supportNum: r[6],
            keywords: r[8] || '',
            hasReport: r[9] === 'true',
            code: r[14] || '',
            conclusionYear: r[15] || '',
            queries: [kw],
          });
          got += 1;
        }
        page += 1;
        fetched += rows.length;
        if (rows.length < PAGE_SIZE || (total > 0 && fetched >= total)) break;
        await sleep(REQ_DELAY);
      }
      console.log(`  ${corpus} / "${kw}" 命中 ${total}，本轮新增 ${got}`);
      await sleep(REQ_DELAY);
    }
  }
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify([...pool.values()], null, 2), 'utf8');
  console.log(`\n候选池写入 ${CACHE}，共 ${pool.size} 条`);
}

// ---------------------------------------------------------------- 已有批准号

function existingRatifyNos() {
  const set = new Set();
  if (!fs.existsSync(CORPORA_ROOT)) return set;
  for (const dir of fs.readdirSync(CORPORA_ROOT)) {
    const src = path.join(CORPORA_ROOT, dir, 'source');
    if (!fs.statSync(path.join(CORPORA_ROOT, dir)).isDirectory()) continue;
    if (!fs.existsSync(src)) continue;
    for (const f of fs.readdirSync(src)) {
      const m = f.match(/^\d+_\d+_([A-Za-z0-9]+)_/);
      if (m) set.add(m[1]);
    }
  }
  return set;
}

function countDocs(corpusDir) {
  const src = path.join(CORPORA_ROOT, corpusDir, 'source');
  if (!fs.existsSync(src)) return 0;
  return fs.readdirSync(src).filter((f) => /\.(pdf|md|markdown|txt|docx)$/i.test(f)).length;
}

// ---------------------------------------------------------------- 渲染

function years(scope) {
  const m = String(scope || '').match(/(\d{4})-\d{2}-\d{2}.*?(\d{4})-\d{2}-\d{2}/);
  return m ? { startYear: m[1], endYear: m[2] } : { startYear: '', endYear: '' };
}

function safeName(s) {
  return String(s || '').replace(/[/\\?%*:|"<>]/g, '-').trim();
}

function render(d) {
  const { startYear, endYear } = years(d.researchTimeScope);
  const results = d.resultsList || [];
  const lines = [];
  lines.push('---');
  lines.push(`id: ${d.id || ''}`);
  lines.push(`projectName: ${d.projectName || ''}`);
  lines.push(`ratifyNo: ${d.ratifyNo || ''}`);
  lines.push(`projectType: ${d.projectType || ''}`);
  lines.push(`code: ${d.code || ''}`);
  lines.push(`projectAdmin: ${d.projectAdmin || ''}`);
  lines.push(`projectAdminID: ${d.projectAdminID || ''}`);
  lines.push(`adminPosition: ${d.adminPosition ?? ''}`.trimEnd());
  lines.push(`dependUnit: ${d.dependUnit || ''}`);
  lines.push(`dependUintID: ${d.dependUintID || ''}`);
  lines.push(`researchTimeScope: ${d.researchTimeScope || ''}`);
  lines.push(`startYear: ${startYear}`);
  lines.push(`endYear: ${endYear}`);
  lines.push(`supportNum: ${d.supportNum || ''}`);
  lines.push(`hasReport: ${d.hasReport === true || d.hasReport === 'true'}`);
  lines.push(`achievementCount: ${results.length}`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${d.projectName || ''}`);
  lines.push('');
  lines.push('## 项目信息');
  lines.push('');
  lines.push('| 字段 | 内容 |');
  lines.push('| --- | --- |');
  lines.push(`| 批准号 | ${d.ratifyNo || ''} |`);
  lines.push(`| 项目类型 | ${d.projectType || ''} |`);
  lines.push(`| 申请代码 | ${d.code || ''} |`);
  lines.push(`| 负责人 | ${d.projectAdmin || ''} |`);
  lines.push(`| 依托单位 | ${d.dependUnit || ''} |`);
  lines.push(`| 研究期限 | ${d.researchTimeScope || ''} |`);
  lines.push(`| 资助金额 | ${d.supportNum || ''} |`);
  lines.push('');
  lines.push('## 中文摘要');
  lines.push('');
  lines.push(d.projectAbstractC || '');
  lines.push('');
  lines.push('## 英文摘要');
  lines.push('');
  lines.push(d.projectAbstractE || '');
  lines.push('');
  lines.push('## 中文关键词');
  lines.push('');
  lines.push(d.projectKeywordC || '');
  lines.push('');
  lines.push('## 英文关键词');
  lines.push('');
  lines.push(d.projectKeywordE || '');
  if (d.conclusionAbstract) {
    lines.push('');
    lines.push('## 结题摘要');
    lines.push('');
    lines.push(d.conclusionAbstract);
  }
  lines.push('');
  lines.push(`## 成果列表（${results.length}）`);
  lines.push('');
  results.forEach((r, i) => {
    const a = r.result || [];
    lines.push(`${i + 1}. [${a[3] || ''}] ${a[2] || ''} — ${a[4] || ''}`);
  });
  return { text: lines.join('\n') + '\n', startYear, endYear };
}

// ---------------------------------------------------------------- 主流程

function planBuild() {
  if (!fs.existsSync(CACHE)) throw new Error('缺少候选池，先运行 collect');
  const pool = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  const taken = existingRatifyNos();
  const domainOf = { '自然科学基金-AI与医疗': 'medical', '自然科学基金-AI与机器人自动化': 'robot' };
  const buckets = { medical: [], robot: [] };
  for (const item of pool) {
    if (taken.has(item.ratifyNo)) continue;
    const c = classify(item);
    if (!c) continue;
    item.score = c.score;
    buckets[c.domain].push(item);
  }
  for (const k of Object.keys(buckets)) {
    buckets[k].sort((a, b) => (b.hasReport ? 1 : 0) - (a.hasReport ? 1 : 0) || b.score - a.score);
  }
  const jobs = [];
  for (const [corpus, domain] of Object.entries(domainOf)) {
    const have = countDocs(corpus);
    const need = Math.max(0, TARGET - have);
    jobs.push({ corpus, domain, have, need, picked: buckets[domain].slice(0, need) });
  }
  return { jobs, buckets, poolSize: pool.length, taken: taken.size };
}

async function apply(jobs) {
  for (const job of jobs) {
    const dir = path.join(CORPORA_ROOT, job.corpus, 'source');
    fs.mkdirSync(dir, { recursive: true });
    let ok = 0;
    let fail = 0;
    for (const item of job.picked) {
      let d;
      try {
        d = await detail(item.id);
      } catch (e) {
        console.error(`  ! ${item.ratifyNo} 详情失败: ${e.message}`);
        fail += 1;
        await sleep(REQ_DELAY);
        continue;
      }
      d.id = item.id;
      const { text, startYear, endYear } = render(d);
      const file = path.join(
        dir,
        `${startYear}_${endYear}_${d.ratifyNo}_${safeName(d.projectAdmin)}_${safeName(d.projectName)}.md`,
      );
      fs.writeFileSync(file, text, 'utf8');
      ok += 1;
      console.log(`  + ${path.basename(file)}`);
      await sleep(REQ_DELAY);
    }
    console.log(`${job.corpus}: 写入 ${ok} 篇，失败 ${fail} 篇`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv.find((a) => !a.startsWith('--')) || 'plan';
  const opt = (k, d) => {
    const hit = argv.find((a) => a.startsWith(`--${k}=`));
    return hit ? hit.slice(k.length + 3) : d;
  };
  const onlyCorpus = opt('corpus', null);

  if (cmd === 'collect') {
    console.log('采集候选池…');
    await collect();
    return;
  }

  const { jobs, buckets, poolSize, taken } = planBuild();
  console.log(`候选池 ${poolSize} 条，已有批准号 ${taken} 个`);
  console.log(`可分配：医疗 ${buckets.medical.length} 条，机器人 ${buckets.robot.length} 条\n`);
  const filtered = onlyCorpus ? jobs.filter((j) => j.corpus === onlyCorpus) : jobs;
  for (const j of filtered) {
    console.log(`${j.corpus}: 现有 ${j.have} 篇，目标 ${TARGET}，计划新增 ${j.picked.length} 篇`);
    const showAll = argv.includes('--all');
    for (const p of showAll ? j.picked : j.picked.slice(0, 10)) {
      console.log(`   · ${p.ratifyNo} ${p.admin} ${p.title.slice(0, 46)} | kw=${(p.keywords || '').slice(0, 40)}`);
    }
    if (!showAll && j.picked.length > 10) console.log(`   … 其余 ${j.picked.length - 10} 篇略`);
  }
  if (cmd === 'apply') {
    console.log('\n开始写入…');
    await apply(filtered);
    for (const j of filtered) console.log(`${j.corpus}: 现共 ${countDocs(j.corpus)} 篇`);
  } else {
    console.log('\n[dry-run] 加 apply 才会写入文件');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
