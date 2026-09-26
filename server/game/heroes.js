'use strict';

const KINGDOMS = {
  shu: { name: 'จ๊ก', cn: '蜀' },
  wei: { name: 'วุย', cn: '魏' },
  wu: { name: 'ง่อ', cn: '吴' },
  qun: { name: 'อิสระ', cn: '群' },
};

const ROLES = {
  lord: { name: 'จักรพรรดิ', cn: '主公', goal: 'กำจัดกบฏและผู้ทรยศทั้งหมด' },
  loyalist: { name: 'ขุนนางภักดี', cn: '忠臣', goal: 'ปกป้องจักรพรรดิ และกำจัดกบฏกับผู้ทรยศ' },
  rebel: { name: 'กบฏ', cn: '反贼', goal: 'สังหารจักรพรรดิ' },
  traitor: { name: 'ผู้ทรยศ', cn: '内奸', goal: 'เป็นผู้รอดชีวิตคนสุดท้าย' },
};

const SKILLS = {
  rende: { name: 'ใจเมตตา', cn: '仁德', active: true, desc: 'ช่วงเล่นการ์ด: มอบการ์ดในมือจำนวนใดก็ได้ให้ผู้เล่นอื่น หากในเทิร์นนี้มอบครบ 2 ใบขึ้นไป ฟื้นฟูเลือด 1 (ครั้งเดียวต่อเทิร์น)' },
  jijiang: { name: 'ปลุกใจ', cn: '激将', lord: true, active: true, desc: '(ทักษะจักรพรรดิ) เมื่อต้องใช้หรือตอบสนองด้วย "สังหาร" ขอให้ผู้เล่นฝ่ายจ๊กใช้ "สังหาร" แทนได้' },
  wusheng: { name: 'เทพสงคราม', cn: '武圣', desc: 'ใช้การ์ดสีแดงใดๆ (ในมือหรืออุปกรณ์) เป็น "สังหาร" ได้' },
  paoxiao: { name: 'คำราม', cn: '咆哮', desc: 'ใช้ "สังหาร" ได้ไม่จำกัดครั้ง' },
  guanxing: { name: 'ดูดาว', cn: '观星', desc: 'ช่วงเริ่มเทิร์น ดูการ์ดบนกอง X ใบ (X = ผู้เล่นที่รอด สูงสุด 5) แล้วจัดวางบนหรือใต้กอง' },
  kongcheng: { name: 'เมืองร้าง', cn: '空城', desc: 'ขณะไม่มีการ์ดในมือ จะไม่ตกเป็นเป้าหมายของ "สังหาร" และ "ดวล"' },
  longdan: { name: 'ใจมังกร', cn: '龙胆', desc: 'ใช้ "สังหาร" เป็น "หลบ" และใช้ "หลบ" เป็น "สังหาร" ได้' },
  mashu: { name: 'ขี่ม้า', cn: '马术', desc: 'ระยะจากคุณไปยังผู้เล่นอื่น -1' },
  tieji: { name: 'ทหารม้าเหล็ก', cn: '铁骑', desc: 'เมื่อใช้ "สังหาร" ใส่เป้าหมาย สามารถตัดสิน ถ้าเป็นสีแดง เป้าหมายใช้ "หลบ" ไม่ได้' },
  jizhi: { name: 'ปัญญาเฉียบ', cn: '集智', desc: 'เมื่อใช้การ์ดกลยุทธ์ (ไม่ใช่แบบหน่วงเวลา) จั่วการ์ด 1 ใบ' },
  qicai: { name: 'อัจฉริยะ', cn: '奇才', desc: 'การ์ดกลยุทธ์ของคุณไม่จำกัดระยะ' },
  jianxiong: { name: 'วีรชนเจ้าเล่ห์', cn: '奸雄', desc: 'หลังได้รับความเสียหาย ได้การ์ดที่ทำความเสียหายนั้นขึ้นมือ' },
  hujia: { name: 'คุ้มกัน', cn: '护驾', lord: true, desc: '(ทักษะจักรพรรดิ) เมื่อต้องใช้ "หลบ" ขอให้ผู้เล่นฝ่ายวุยใช้ "หลบ" แทนได้' },
  fankui: { name: 'ตอบโต้', cn: '反馈', desc: 'หลังได้รับความเสียหาย หยิบการ์ด 1 ใบของผู้ทำความเสียหาย' },
  guicai: { name: 'ปัญญาปีศาจ', cn: '鬼才', desc: 'ก่อนผลการตัดสินใดๆ มีผล ใช้การ์ดในมือ 1 ใบแทนการ์ดตัดสินได้' },
  ganglie: { name: 'ดุดันไม่ยอม', cn: '刚烈', desc: 'หลังได้รับความเสียหาย ตัดสิน ถ้าไม่ใช่โพแดง ผู้ทำความเสียหายเลือก: ทิ้งการ์ดในมือ 2 ใบ หรือรับความเสียหาย 1' },
  tuxi: { name: 'จู่โจม', cn: '突袭', desc: 'ช่วงจั่วการ์ด เลือกไม่จั่ว แล้วหยิบการ์ดในมือของผู้เล่นอื่นสูงสุด 2 คน คนละ 1 ใบแทน' },
  luoyi: { name: 'ถอดเกราะ', cn: '裸衣', desc: 'ช่วงจั่วการ์ด จั่วน้อยลง 1 ใบ แล้ว "สังหาร" และ "ดวล" ของคุณทำความเสียหาย +1 ในเทิร์นนี้' },
  tiandu: { name: 'ฟ้าอิจฉา', cn: '天妒', desc: 'หลังการตัดสินของคุณมีผล ได้การ์ดตัดสินนั้นขึ้นมือ' },
  yiji: { name: 'กลยุทธ์ทิ้งท้าย', cn: '遗计', desc: 'ได้รับความเสียหายทุก 1 แต้ม จั่วการ์ด 2 ใบ' },
  luoshen: { name: 'เทพีลั่วสุ่ย', cn: '洛神', desc: 'ช่วงเริ่มเทิร์น ตัดสินซ้ำได้เรื่อยๆ เก็บการ์ดสีดำขึ้นมือ จนกว่าจะออกสีแดง' },
  qingguo: { name: 'ล่มเมือง', cn: '倾国', desc: 'ใช้การ์ดในมือสีดำเป็น "หลบ" ได้' },
  zhiheng: { name: 'ถ่วงดุล', cn: '制衡', active: true, desc: 'ช่วงเล่นการ์ด (1 ครั้ง/เทิร์น) ทิ้งการ์ดจำนวนใดก็ได้ แล้วจั่วเท่าจำนวนที่ทิ้ง' },
  jiuyuan: { name: 'ช่วยเหลือ', cn: '救援', lord: true, desc: '(ทักษะจักรพรรดิ) เมื่อใกล้ตาย "ลูกท้อ" จากผู้เล่นฝ่ายง่อฟื้นฟูให้คุณเพิ่มอีก 1' },
  qixi: { name: 'จู่โจมยามวิกาล', cn: '奇袭', desc: 'ใช้การ์ดสีดำใดๆ เป็น "รื้อสะพาน" ได้' },
  keji: { name: 'ข่มใจ', cn: '克己', desc: 'ถ้าไม่ได้ใช้หรือตอบสนองด้วย "สังหาร" ในเทิร์นนี้ ข้ามช่วงทิ้งการ์ด' },
  kurou: { name: 'ทรมานตน', cn: '苦肉', active: true, desc: 'ช่วงเล่นการ์ด: เสียเลือด 1 แล้วจั่วการ์ด 2 ใบ (ไม่จำกัดครั้ง)' },
  yingzi: { name: 'สง่างาม', cn: '英姿', desc: 'ช่วงจั่วการ์ด จั่วเพิ่ม 1 ใบ' },
  fanjian: { name: 'ยุแยง', cn: '反间', active: true, desc: 'ช่วงเล่นการ์ด (1 ครั้ง/เทิร์น) ให้ผู้เล่นอื่นทายดอก แล้วหยิบการ์ดในมือคุณ 1 ใบ ถ้าทายผิดได้รับความเสียหาย 1' },
  guose: { name: 'โฉมงามล่มเมือง', cn: '国色', desc: 'ใช้การ์ดข้าวหลามตัดเป็น "สำราญลืมจ๊ก" ได้' },
  liuli: { name: 'ปัดเป่า', cn: '流离', desc: 'เมื่อตกเป็นเป้าของ "สังหาร" ทิ้งการ์ด 1 ใบเพื่อโอนเป้าไปยังผู้เล่นอื่นในระยะโจมตีของคุณ' },
  qianxun: { name: 'ถ่อมตน', cn: '谦逊', desc: 'ไม่ตกเป็นเป้าหมายของ "ฉวยโอกาส" และ "สำราญลืมจ๊ก"' },
  lianying: { name: 'ต่อเนื่อง', cn: '连营', desc: 'เมื่อเสียการ์ดใบสุดท้ายในมือ จั่วการ์ด 1 ใบ' },
  jieyin: { name: 'ผูกสัมพันธ์', cn: '结姻', active: true, desc: 'ช่วงเล่นการ์ด (1 ครั้ง/เทิร์น) ทิ้งการ์ดในมือ 2 ใบ คุณและตัวละครชายที่บาดเจ็บ 1 คนฟื้นฟูเลือด 1' },
  xiaoji: { name: 'วีรสตรี', cn: '枭姬', desc: 'เมื่อเสียอุปกรณ์ 1 ชิ้น จั่วการ์ด 2 ใบ' },
  jijiu: { name: 'ปฐมพยาบาล', cn: '急救', desc: 'นอกเทิร์นของคุณ ใช้การ์ดสีแดงเป็น "ลูกท้อ" ได้' },
  qingnang: { name: 'ถุงยาเขียว', cn: '青囊', active: true, desc: 'ช่วงเล่นการ์ด (1 ครั้ง/เทิร์น) ทิ้งการ์ดในมือ 1 ใบ ให้ผู้เล่นที่บาดเจ็บ 1 คนฟื้นฟูเลือด 1' },
  wushuang: { name: 'ไร้เทียมทาน', cn: '无双', desc: '"สังหาร" ของคุณต้องใช้ "หลบ" 2 ใบ; ในการ "ดวล" ฝ่ายตรงข้ามต้องใช้ "สังหาร" ครั้งละ 2 ใบ' },
  lijian: { name: 'ยุให้แตกกัน', cn: '离间', active: true, desc: 'ช่วงเล่นการ์ด (1 ครั้ง/เทิร์น) ทิ้งการ์ด 1 ใบ เลือกตัวละครชาย 2 คน ให้คนแรก "ดวล" กับคนที่สอง' },
  biyue: { name: 'บดบังจันทร์', cn: '闭月', desc: 'ช่วงจบเทิร์น จั่วการ์ด 1 ใบ' },
};

const HEROES = {
  liubei: { name: 'เล่าปี่', cn: '刘备', kingdom: 'shu', hp: 4, gender: 'm', skills: ['rende', 'jijiang'] },
  guanyu: { name: 'กวนอู', cn: '关羽', kingdom: 'shu', hp: 4, gender: 'm', skills: ['wusheng'] },
  zhangfei: { name: 'เตียวหุย', cn: '张飞', kingdom: 'shu', hp: 4, gender: 'm', skills: ['paoxiao'] },
  zhugeliang: { name: 'ขงเบ้ง', cn: '诸葛亮', kingdom: 'shu', hp: 3, gender: 'm', skills: ['guanxing', 'kongcheng'] },
  zhaoyun: { name: 'จูล่ง', cn: '赵云', kingdom: 'shu', hp: 4, gender: 'm', skills: ['longdan'] },
  machao: { name: 'ม้าเฉียว', cn: '马超', kingdom: 'shu', hp: 4, gender: 'm', skills: ['mashu', 'tieji'] },
  huangyueying: { name: 'อุ๋ยซี', cn: '黄月英', kingdom: 'shu', hp: 3, gender: 'f', skills: ['jizhi', 'qicai'] },

  caocao: { name: 'โจโฉ', cn: '曹操', kingdom: 'wei', hp: 4, gender: 'm', skills: ['jianxiong', 'hujia'] },
  simayi: { name: 'สุมาอี้', cn: '司马懿', kingdom: 'wei', hp: 3, gender: 'm', skills: ['fankui', 'guicai'] },
  xiahoudun: { name: 'แฮหัวตุ้น', cn: '夏侯惇', kingdom: 'wei', hp: 4, gender: 'm', skills: ['ganglie'] },
  zhangliao: { name: 'เตียวเลี้ยว', cn: '张辽', kingdom: 'wei', hp: 4, gender: 'm', skills: ['tuxi'] },
  xuchu: { name: 'เคาทู', cn: '许褚', kingdom: 'wei', hp: 4, gender: 'm', skills: ['luoyi'] },
  guojia: { name: 'กุยแก', cn: '郭嘉', kingdom: 'wei', hp: 3, gender: 'm', skills: ['tiandu', 'yiji'] },
  zhenji: { name: 'นางเอียนสี', cn: '甄姬', kingdom: 'wei', hp: 3, gender: 'f', skills: ['luoshen', 'qingguo'] },

  sunquan: { name: 'ซุนกวน', cn: '孙权', kingdom: 'wu', hp: 4, gender: 'm', skills: ['zhiheng', 'jiuyuan'] },
  ganning: { name: 'กำเหลง', cn: '甘宁', kingdom: 'wu', hp: 4, gender: 'm', skills: ['qixi'] },
  lumeng: { name: 'ลิบอง', cn: '吕蒙', kingdom: 'wu', hp: 4, gender: 'm', skills: ['keji'] },
  huanggai: { name: 'อุยกาย', cn: '黄盖', kingdom: 'wu', hp: 4, gender: 'm', skills: ['kurou'] },
  zhouyu: { name: 'จิวยี่', cn: '周瑜', kingdom: 'wu', hp: 3, gender: 'm', skills: ['yingzi', 'fanjian'] },
  daqiao: { name: 'ต้าเกี้ยว', cn: '大乔', kingdom: 'wu', hp: 3, gender: 'f', skills: ['guose', 'liuli'] },
  luxun: { name: 'ลกซุน', cn: '陆逊', kingdom: 'wu', hp: 3, gender: 'm', skills: ['qianxun', 'lianying'] },
  sunshangxiang: { name: 'ซุนฮูหยิน', cn: '孙尚香', kingdom: 'wu', hp: 3, gender: 'f', skills: ['jieyin', 'xiaoji'] },

  huatuo: { name: 'ฮัวโต๋', cn: '华佗', kingdom: 'qun', hp: 3, gender: 'm', skills: ['jijiu', 'qingnang'] },
  lvbu: { name: 'ลิโป้', cn: '吕布', kingdom: 'qun', hp: 4, gender: 'm', skills: ['wushuang'] },
  diaochan: { name: 'เตียวเสี้ยน', cn: '貂蝉', kingdom: 'qun', hp: 3, gender: 'f', skills: ['lijian', 'biyue'] },
};

const LORD_HEROES = ['liubei', 'caocao', 'sunquan'];

module.exports = { KINGDOMS, ROLES, SKILLS, HEROES, LORD_HEROES };
