'use strict';

// ข้อมูลการ์ดทั้งหมด 108 ใบ (ชุดมาตรฐาน + EX)

const SUIT_SYMBOL = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' };
const SUIT_NAME = { spade: 'โพดำ', heart: 'โพแดง', club: 'ดอกจิก', diamond: 'ข้าวหลามตัด' };
const RANK_STR = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const CARD_INFO = {
  // ── การ์ดพื้นฐาน ──
  attack: { type: 'basic', name: 'สังหาร', cn: '杀', short: 'โจมตี 1 คนในระยะ ต้องใช้「หลบ」 ไม่งั้นเสียเลือด 1', desc: 'เลือกผู้เล่น 1 คนในระยะโจมตี เป้าหมายต้องใช้ "หลบ" มิฉะนั้นได้รับความเสียหาย 1 (ปกติใช้ได้ 1 ครั้งต่อเทิร์น)' },
  dodge: { type: 'basic', name: 'หลบ', cn: '闪', short: 'ยกเลิก「สังหาร」หรือ「ห่าธนู」ที่เล็งมาที่คุณ', desc: 'ใช้ตอบสนองเพื่อยกเลิกผลของ "สังหาร" หรือ "ห่าธนู"' },
  peach: { type: 'basic', name: 'ลูกท้อ', cn: '桃', short: 'ฟื้นเลือด 1 หรือช่วยผู้เล่นที่ใกล้ตาย', desc: 'ในเทิร์นตัวเอง: ฟื้นฟูเลือด 1 / เมื่อมีผู้เล่นใกล้ตาย: ใช้เพื่อช่วยชีวิต' },

  // ── การ์ดกลยุทธ์ ──
  dismantle: { type: 'trick', name: 'รื้อสะพาน', cn: '过河拆桥', short: 'ทิ้งการ์ด 1 ใบของผู้เล่นอื่น (มือ อุปกรณ์ หรือช่องตัดสิน)', desc: 'ทิ้งการ์ด 1 ใบของผู้เล่นอื่น (ในมือ อุปกรณ์ หรือช่องตัดสิน)' },
  steal: { type: 'trick', name: 'ฉวยโอกาส', cn: '顺手牵羊', short: 'หยิบการ์ด 1 ใบของผู้เล่นที่ระยะ 1 มาเป็นของคุณ', desc: 'หยิบการ์ด 1 ใบของผู้เล่นอื่นที่ระยะ 1 มาไว้ในมือ' },
  duel: { type: 'trick', name: 'ดวล', cn: '决斗', short: 'ผลัดกันใช้「สังหาร」 ฝ่ายที่หยุดก่อนเสียเลือด 1', desc: 'ดวลกับผู้เล่นอื่น ผลัดกันใช้ "สังหาร" (เริ่มจากเป้าหมาย) ฝ่ายที่ไม่ใช้ได้รับความเสียหาย 1' },
  barbarian: { type: 'trick', name: 'ทัพหนานหมาน', cn: '南蛮入侵', short: 'ผู้เล่นอื่นทุกคนต้องใช้「สังหาร」 ไม่งั้นเสียเลือด 1', desc: 'ผู้เล่นอื่นทุกคนต้องใช้ "สังหาร" มิฉะนั้นได้รับความเสียหาย 1' },
  arrows: { type: 'trick', name: 'ห่าธนู', cn: '万箭齐发', short: 'ผู้เล่นอื่นทุกคนต้องใช้「หลบ」 ไม่งั้นเสียเลือด 1', desc: 'ผู้เล่นอื่นทุกคนต้องใช้ "หลบ" มิฉะนั้นได้รับความเสียหาย 1' },
  peachgarden: { type: 'trick', name: 'สาบานสวนท้อ', cn: '桃园结义', short: 'ผู้เล่นทุกคนฟื้นเลือด 1', desc: 'ผู้เล่นทุกคนฟื้นฟูเลือด 1' },
  harvest: { type: 'trick', name: 'เก็บเกี่ยวห้าธัญพืช', cn: '五谷丰登', short: 'เปิดการ์ดเท่าจำนวนผู้เล่น ทุกคนเลือกเก็บคนละ 1 ใบ', desc: 'เปิดการ์ดเท่าจำนวนผู้เล่นที่รอด ทุกคนเลือกเก็บคนละ 1 ใบ' },
  exnihilo: { type: 'trick', name: 'เสกจากความว่าง', cn: '无中生有', short: 'จั่วการ์ด 2 ใบ', desc: 'จั่วการ์ด 2 ใบ' },
  borrowsword: { type: 'trick', name: 'ยืมดาบฆ่าคน', cn: '借刀杀人', short: 'สั่งคนมีอาวุธ「สังหาร」คนที่คุณเลือก ไม่ทำ = คุณได้อาวุธ', desc: 'สั่งให้ผู้เล่นที่มีอาวุธใช้ "สังหาร" ใส่เป้าหมายที่คุณเลือก หากไม่ทำ คุณได้อาวุธของเขา' },
  negate: { type: 'trick', name: 'ไร้ช่องโหว่', cn: '无懈可击', short: 'ยกเลิกผลการ์ดกลยุทธ์ 1 ใบต่อเป้าหมาย 1 คน', desc: 'ยกเลิกผลของการ์ดกลยุทธ์ 1 ใบต่อเป้าหมาย 1 คน (ใช้ตอบโต้ ไร้ช่องโหว่ ได้)' },
  indulgence: { type: 'delayed', name: 'มีสุขลืมเมือง', cn: '乐不思蜀', short: 'วางบนผู้เล่นอื่น ถ้าตัดสินไม่ใช่ ♥ เขาข้ามช่วงเล่นการ์ด', desc: 'กลยุทธ์หน่วงเวลา: วางบนผู้เล่นอื่น ตอนตัดสินถ้าไม่ใช่โพแดง เป้าหมายข้ามช่วงเล่นการ์ด' },
  lightning: { type: 'delayed', name: 'สายฟ้า', cn: '闪电', short: 'ส่งต่อรอบวง ตัดสินได้ ♠2-9 เสียเลือด 3', desc: 'กลยุทธ์หน่วงเวลา: วางบนตัวเอง ตอนตัดสินถ้าเป็นโพดำ 2-9 ได้รับความเสียหายสายฟ้า 3 มิฉะนั้นส่งต่อให้คนถัดไป' },

  // ── อาวุธ ──
  crossbow: { type: 'equip', slot: 'weapon', range: 1, name: 'หน้าไม้ขงเบ้ง', cn: '诸葛连弩', short: 'ใช้「สังหาร」ได้ไม่จำกัดครั้ง', desc: 'ระยะ 1: ใช้ "สังหาร" ได้ไม่จำกัดครั้ง' },
  double_swords: { type: 'equip', slot: 'weapon', range: 2, name: 'กระบี่คู่หยินหยาง', cn: '雌雄双股剑', short: 'สังหารเพศตรงข้าม: เขาทิ้ง 1 ใบ หรือให้คุณจั่ว 1 ใบ', desc: 'ระยะ 2: เมื่อสังหารเพศตรงข้าม เป้าหมายต้องทิ้งการ์ดในมือ 1 ใบ หรือให้คุณจั่ว 1 ใบ' },
  blue_steel: { type: 'equip', slot: 'weapon', range: 2, name: 'กระบี่ชิงกัง', cn: '青釭剑', short: '「สังหาร」ของคุณไม่สนใจเกราะของเป้าหมาย', desc: 'ระยะ 2: "สังหาร" ของคุณไม่สนใจเกราะของเป้าหมาย' },
  frost_blade: { type: 'equip', slot: 'weapon', range: 2, name: 'ดาบน้ำแข็ง', cn: '寒冰剑', short: 'สังหารโดน: เลือกทิ้งการ์ดเขา 2 ใบแทนทำความเสียหายได้', desc: 'ระยะ 2: เมื่อสังหารจะทำความเสียหาย สามารถเปลี่ยนเป็นทิ้งการ์ดของเป้าหมาย 2 ใบแทน' },
  green_dragon: { type: 'equip', slot: 'weapon', range: 3, name: 'ง้าวมังกรเขียว', cn: '青龙偃月刀', short: 'เมื่อสังหารถูกหลบ ใช้「สังหาร」ใส่คนเดิมต่อได้', desc: 'ระยะ 3: เมื่อสังหารถูกหลบ สามารถใช้ "สังหาร" ใส่เป้าหมายเดิมต่อได้' },
  serpent_spear: { type: 'equip', slot: 'weapon', range: 3, name: 'ทวนอสรพิษ', cn: '丈八蛇矛', short: 'ใช้การ์ดในมือ 2 ใบใดก็ได้เป็น「สังหาร」', desc: 'ระยะ 3: ใช้การ์ดในมือ 2 ใบเป็น "สังหาร" ได้' },
  axe: { type: 'equip', slot: 'weapon', range: 3, name: 'ขวานผ่าศิลา', cn: '贯石斧', short: 'เมื่อสังหารถูกหลบ ทิ้ง 2 ใบเพื่อให้โดนอยู่ดี', desc: 'ระยะ 3: เมื่อสังหารถูกหลบ สามารถทิ้งการ์ด 2 ใบเพื่อให้โดนอยู่ดี' },
  halberd: { type: 'equip', slot: 'weapon', range: 4, name: 'ทวนฟางเทียน', cn: '方天画戟', short: '「สังหาร」ใบสุดท้ายในมือ เลือกเป้าได้ถึง 3 คน', desc: 'ระยะ 4: ถ้า "สังหาร" เป็นการ์ดใบสุดท้ายในมือ เลือกเป้าหมายได้สูงสุด 3 คน' },
  kylin_bow: { type: 'equip', slot: 'weapon', range: 5, name: 'ธนูกิเลน', cn: '麒麟弓', short: 'สังหารโดน: ทิ้งม้าของเป้าหมายได้ 1 ตัว', desc: 'ระยะ 5: เมื่อสังหารโดนเป้าหมาย สามารถทิ้งม้าของเป้าหมาย 1 ตัว' },

  // ── เกราะ ──
  eight_trigrams: { type: 'equip', slot: 'armor', name: 'ค่ายกลแปดทิศ', cn: '八卦阵', short: 'ต้องใช้「หลบ」? ตัดสิน ถ้าออกสีแดงนับเป็น「หลบ」', desc: 'เมื่อต้องใช้ "หลบ" สามารถตัดสิน ถ้าเป็นสีแดงนับเป็นใช้ "หลบ"' },
  renwang: { type: 'equip', slot: 'armor', name: 'โล่เหรินหวัง', cn: '仁王盾', short: '「สังหาร」สีดำไม่มีผลต่อคุณ', desc: '"สังหาร" สีดำไม่มีผลต่อคุณ' },

  // ── ม้า ──
  jueying: { type: 'equip', slot: 'defHorse', name: 'ม้าเจวี๋ยอิ่ง +1', cn: '绝影', short: 'ม้าป้องกัน: คนอื่นนับระยะมาหาคุณ +1', desc: 'ผู้เล่นอื่นนับระยะมาหาคุณ +1' },
  dilu: { type: 'equip', slot: 'defHorse', name: 'ม้าเต็กเลา +1', cn: '的卢', short: 'ม้าป้องกัน: คนอื่นนับระยะมาหาคุณ +1', desc: 'ผู้เล่นอื่นนับระยะมาหาคุณ +1' },
  zhuahuang: { type: 'equip', slot: 'defHorse', name: 'ม้าจ้วาหวง +1', cn: '爪黄飞电', short: 'ม้าป้องกัน: คนอื่นนับระยะมาหาคุณ +1', desc: 'ผู้เล่นอื่นนับระยะมาหาคุณ +1' },
  chitu: { type: 'equip', slot: 'offHorse', name: 'ม้าเซ็กเธาว์ -1', cn: '赤兔', short: 'ม้าบุก: คุณนับระยะไปหาคนอื่น -1', desc: 'คุณนับระยะไปหาผู้เล่นอื่น -1' },
  dawan: { type: 'equip', slot: 'offHorse', name: 'ม้าต้าหว่าน -1', cn: '大宛', short: 'ม้าบุก: คุณนับระยะไปหาคนอื่น -1', desc: 'คุณนับระยะไปหาผู้เล่นอื่น -1' },
  zixing: { type: 'equip', slot: 'offHorse', name: 'ม้าจื่อซิง -1', cn: '紫骍', short: 'ม้าบุก: คุณนับระยะไปหาคนอื่น -1', desc: 'คุณนับระยะไปหาผู้เล่นอื่น -1' },
};

// S=โพดำ H=โพแดง C=ดอกจิก D=ข้าวหลามตัด
const DECK_SPEC = {
  attack: 'S7 S8 S8 S9 S9 S10 S10 C2 C3 C4 C5 C6 C7 C8 C8 C9 C9 C10 C10 CJ CJ H10 H10 HJ D6 D7 D8 D9 D10 DK',
  dodge: 'H2 H2 HK D2 D2 D3 D4 D5 D6 D7 D8 D9 D10 DJ DJ',
  peach: 'H3 H4 H6 H7 H8 H9 HQ DQ',
  dismantle: 'S3 S4 SQ C3 C4 HQ',
  steal: 'S3 S4 SJ D3 D4',
  duel: 'SA CA DA',
  barbarian: 'S7 SK C7',
  arrows: 'HA',
  peachgarden: 'HA',
  harvest: 'H3 H4',
  exnihilo: 'H7 H8 H9 HJ',
  borrowsword: 'CQ CK',
  negate: 'SJ CQ CK DQ',
  indulgence: 'S6 C6 H6',
  lightning: 'SA HQ',
  crossbow: 'CA DA',
  double_swords: 'S2',
  blue_steel: 'S6',
  frost_blade: 'S2',
  green_dragon: 'S5',
  serpent_spear: 'SQ',
  axe: 'D5',
  halberd: 'DQ',
  kylin_bow: 'H5',
  eight_trigrams: 'S2 C2',
  renwang: 'C2',
  jueying: 'S5',
  dilu: 'C5',
  zhuahuang: 'HK',
  chitu: 'H5',
  dawan: 'SK',
  zixing: 'DK',
};

const SUIT_LETTER = { S: 'spade', H: 'heart', C: 'club', D: 'diamond' };
const RANK_LETTER = { A: 1, J: 11, Q: 12, K: 13 };

function buildDeck() {
  const cards = [];
  let id = 1;
  for (const [key, spec] of Object.entries(DECK_SPEC)) {
    for (const tok of spec.split(/\s+/)) {
      const suit = SUIT_LETTER[tok[0]];
      const r = tok.slice(1);
      const rank = RANK_LETTER[r] || Number(r);
      cards.push({ id: id++, key, suit, rank });
    }
  }
  return cards;
}

function colorOf(c) {
  if (!c) return null;
  if (c.color !== undefined) return c.color;
  return c.suit === 'heart' || c.suit === 'diamond' ? 'red' : 'black';
}
const isRed = (c) => colorOf(c) === 'red';
const isBlack = (c) => colorOf(c) === 'black';

function cardStr(c) {
  if (!c) return '';
  return `${CARD_INFO[c.key].name}${SUIT_SYMBOL[c.suit] || ''}${RANK_STR[c.rank] || ''}`;
}

module.exports = { CARD_INFO, SUIT_SYMBOL, SUIT_NAME, RANK_STR, buildDeck, colorOf, isRed, isBlack, cardStr };
