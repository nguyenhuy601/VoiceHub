/** Catalog ảnh động / sticker — client-side, không cần API key.
 *
 * Ảnh động: Google Noto Animated Emoji (fonts.gstatic) — mỗi codepoint một GIF thật, label khớp nghĩa.
 * Sticker: cụm từ VN hằng ngày (SVG/PNG) + Twemoji PNG tĩnh.
 */

import { CHAT_PHRASE_STICKER_ITEMS } from './chatDailyPhraseStickers.js';

/** @typedef {{ id: string, label: string, tags: string[], url: string, fileName: string, mimeType: string, phrase?: { text: string, emoji: string, bg: string, color: string } }} ChatMediaItem */

const TWEMOJI = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72';
const NOTO_GIF = 'https://fonts.gstatic.com/s/e/notoemoji/latest';

/** @param {string} cp @param {string} label @param {string[]} tags */
function sticker(cp, label, tags) {
  return {
    id: `stk-${cp}`,
    label,
    tags,
    url: `${TWEMOJI}/${cp}.png`,
    fileName: `${cp}.png`,
    mimeType: 'image/png',
  };
}

/**
 * GIF động từ Noto Emoji Animation (Google Fonts CDN).
 * @param {string} id
 * @param {string} label
 * @param {string[]} tags
 * @param {string} codepoint hex, ví dụ `1f64f` hoặc `1f64f_1f3fb`
 */
function gif(id, label, tags, codepoint) {
  const cp = String(codepoint || '').trim().toLowerCase();
  const slug = id.replace(/^gif-/, '');
  return {
    id,
    label,
    tags,
    url: `${NOTO_GIF}/${cp}/512.gif`,
    fileName: `${slug}.gif`,
    mimeType: 'image/gif',
  };
}

/** @type {ChatMediaItem[]} */
export const CHAT_GIF_ITEMS = [
  // Cảm ơn / lịch sự — nhiều biến thể visual khác nhau
  gif('gif-thanks', 'Cảm ơn', ['cảm ơn', 'thanks', 'thank', 'biết ơn', 'pray'], '1f64f'),
  gif('gif-thanks-light', 'Cảm ơn ạ', ['cảm ơn', 'thanks', 'thank you'], '1f64f_1f3fb'),
  gif('gif-thanks-medium-light', 'Thanks', ['cảm ơn', 'thanks', 'thank you'], '1f64f_1f3fc'),
  gif('gif-thanks-medium', 'Thank you', ['cảm ơn', 'thanks', 'thank you'], '1f64f_1f3fd'),
  gif('gif-thanks-medium-dark', 'Cảm ơn nhiều', ['cảm ơn', 'thanks', 'grateful'], '1f64f_1f3fe'),
  gif('gif-thanks-dark', 'Thanks a lot', ['cảm ơn', 'thanks', 'nhiều'], '1f64f_1f3ff'),
  gif('gif-gift', 'Quà cảm ơn', ['cảm ơn', 'thanks', 'quà', 'gift'], '1f381'),
  gif('gif-bouquet', 'Hoa cảm ơn', ['cảm ơn', 'thanks', 'hoa', 'bouquet'], '1f490'),
  gif('gif-rose', 'Hoa hồng', ['cảm ơn', 'thanks', 'hoa', 'yêu'], '1f339'),
  gif('gif-sakura', 'Hoa anh đào', ['cảm ơn', 'thanks', 'hoa'], '1f338'),
  gif('gif-love-letter', 'Thư cảm ơn', ['cảm ơn', 'thanks', 'thư', 'letter'], '1f48c'),
  gif('gif-heart-ribbon', 'Tim ruy băng', ['cảm ơn', 'thanks', 'tim', 'love'], '1f49d'),
  gif('gif-handshake', 'Bắt tay', ['cảm ơn', 'thanks', 'bắt tay', 'handshake', 'deal'], '1f91d'),
  gif('gif-hug', 'Ôm cảm ơn', ['cảm ơn', 'thanks', 'ôm', 'hug'], '1f917'),
  gif('gif-angel', 'Biết ơn', ['cảm ơn', 'thanks', 'biết ơn', 'angel'], '1f607'),
  gif('gif-blush-smile', 'Cảm ơn nha', ['cảm ơn', 'thanks', 'vui', 'smile'], '263a_fe0f'),
  gif('gif-heart-eyes-thanks', 'Yêu quá', ['cảm ơn', 'thanks', 'yêu', 'love'], '1f970'),

  // Xin lỗi / tha lỗi
  gif('gif-sorry', 'Xin lỗi', ['xin lỗi', 'sorry', 'lỗi', 'tha lỗi'], '1f61f'),
  gif('gif-sorry-sweat', 'Xin lỗi nha', ['xin lỗi', 'sorry', 'ngại', 'lỗi'], '1f605'),
  gif('gif-sorry-flush', 'Lỗi rồi', ['xin lỗi', 'sorry', 'lỗi', 'xấu hổ'], '1f633'),
  gif('gif-sorry-sad', 'Xin lỗi ạ', ['xin lỗi', 'sorry', 'lỗi', 'buồn'], '1f625'),
  gif('gif-sorry-down', 'Tha lỗi nhé', ['xin lỗi', 'sorry', 'tha lỗi', 'please'], '1f614'),

  // Cử chỉ / phản ứng công việc
  gif('gif-like', 'Thích', ['thích', 'like', 'ok', 'yes', 'đồng ý', 'dạ', 'vâng'], '1f44d'),
  gif('gif-dislike', 'Không thích', ['dislike', 'no', 'không'], '1f44e'),
  gif('gif-ok', 'OK', ['ok', 'được', 'yes', 'đồng ý'], '1f44c'),
  gif('gif-clap', 'Vỗ tay', ['vỗ tay', 'clap', 'good', 'tuyệt', 'hay'], '1f44f'),
  gif('gif-clap-light', 'Vỗ tay 2', ['vỗ tay', 'clap', 'hay', 'bravo'], '1f44f_1f3fb'),
  gif('gif-raise', 'Giơ tay', ['celebrate', 'vui', 'yeah', 'giơ tay'], '1f64c'),
  gif('gif-wave', 'Xin chào', ['hello', 'xin chào', 'hi', 'wave', 'chào'], '1f44b'),
  gif('gif-wave2', 'Chào bạn', ['hello', 'chào', 'bye', 'wave'], '1f44b_1f3fb'),
  gif('gif-bye', 'Tạm biệt', ['bye', 'tạm biệt', 'goodbye', 'chào'], '1f44b_1f3fc'),
  gif('gif-stop', 'Dừng', ['stop', 'dừng', 'khoan'], '270b'),
  gif('gif-punch', 'Cố lên', ['power', 'cố', 'yeah', 'fight'], '1f44a'),
  gif('gif-rock', 'Rock', ['rock', 'yeah', 'cool'], '1f918'),
  gif('gif-call', 'Gọi', ['call', 'gọi', 'phone'], '1f919'),
  gif('gif-fingers-crossed', 'Chúc may', ['may mắn', 'luck', 'good luck'], '1f91e'),
  gif('gif-ily', 'I love you', ['love', 'yêu', 'tim'], '1f91f'),
  gif('gif-muscle', 'Cơ bắp', ['mạnh', 'strong', 'power'], '1f4aa'),
  gif('gif-point-up', 'Lên', ['lên', 'up'], '1f446'),
  gif('gif-point-down', 'Xuống', ['xuống', 'down'], '1f447'),

  // Cảm xúc
  gif('gif-smile', 'Cười', ['cười', 'vui', 'smile', 'haha'], '1f600'),
  gif('gif-grin', 'Cười to', ['cười', 'vui', 'happy'], '1f604'),
  gif('gif-lol', 'Cười lớn', ['cười', 'lol', 'funny', 'haha'], '1f602'),
  gif('gif-rofl', 'Cười lăn', ['cười', 'rofl', 'haha', 'lol'], '1f923'),
  gif('gif-wink', 'Nháy mắt', ['wink', 'nháy', 'cute'], '1f609'),
  gif('gif-love', 'Mắt tim', ['yêu', 'love', 'tim', 'thích'], '1f60d'),
  gif('gif-kiss', 'Hôn gió', ['hôn', 'kiss', 'yêu'], '1f618'),
  gif('gif-thinking', 'Suy nghĩ', ['suy nghĩ', 'think', 'hmm'], '1f914'),
  gif('gif-wow', 'Wow', ['wow', 'surprise', 'ngạc nhiên'], '1f62e'),
  gif('gif-shock', 'Sốc', ['sốc', 'shock', 'omg'], '1f632'),
  gif('gif-sad', 'Buồn', ['buồn', 'sad', 'xin lỗi'], '1f61e'),
  gif('gif-cry', 'Khóc', ['khóc', 'cry', 'buồn', 'sad', 'xin lỗi'], '1f622'),
  gif('gif-cry-hard', 'Khóc to', ['khóc', 'cry', 'buồn'], '1f62d'),
  gif('gif-angry', 'Giận', ['giận', 'angry', 'tức'], '1f621'),
  gif('gif-facepalm', 'Facepalm', ['facepalm', 'trời ơi', 'chán'], '1f644'),
  gif('gif-shrug', 'Không biết', ['shrug', 'không biết', 'chịu'], '1f648'),
  gif('gif-sleep', 'Ngủ', ['ngủ', 'sleep', 'mệt', 'tired', 'ngủ ngon'], '1f634'),
  gif('gif-tired', 'Mệt', ['mệt', 'tired'], '1f62b'),
  gif('gif-party', 'Party', ['party', 'vui', 'ăn mừng', 'chúc mừng'], '1f973'),
  gif('gif-cool', 'Ngầu', ['cool', 'ngầu', 'nice'], '1f60e'),
  gif('gif-nerd', 'Nerd', ['nerd', 'dev', 'code'], '1f913'),
  gif('gif-confused', 'Bối rối', ['confused', 'hmm', 'what', 'sao'], '1f615'),
  gif('gif-please', 'Xin nhờ', ['please', 'xin', 'cầu', 'giúp', 'nhờ', 'xin lỗi'], '1f97a'),
  gif('gif-yummy', 'Ngon', ['ngon', 'yum', 'food', 'ăn cơm', 'ăn'], '1f60b'),

  // Biểu tượng / công việc
  gif('gif-heart', 'Trái tim', ['tim', 'heart', 'love', 'yêu'], '2764'),
  gif('gif-sparkle', 'Lấp lánh', ['sparkle', 'vui', 'magic'], '2728'),
  gif('gif-star', 'Sao', ['sao', 'star', 'good'], '2b50'),
  gif('gif-fire', 'Fire', ['fire', 'hot', 'ngon'], '1f525'),
  gif('gif-100', '100 điểm', ['100', 'perfect', 'điểm', 'chuẩn'], '1f4af'),
  gif('gif-check', 'Xong rồi', ['xong', 'done', 'ok', 'check', 'hoàn thành'], '2705'),
  gif('gif-cross', 'Sai', ['no', 'sai', 'wrong', 'reject'], '274c'),
  gif('gif-question', 'Hỏi', ['hỏi', 'question', '?', 'thắc mắc'], '2753'),
  gif('gif-idea', 'Ý tưởng', ['idea', 'ý tưởng', 'sáng kiến'], '1f4a1'),
  gif('gif-rocket', 'Rocket', ['rocket', 'ship', 'deploy', 'launch'], '1f680'),
  gif('gif-confetti', 'Ăn mừng', ['ăn mừng', 'party', 'celebrate', 'chúc mừng'], '1f389'),
  gif('gif-trophy', 'Cúp', ['win', 'thắng', 'cup', 'congrats'], '1f3c6'),
  gif('gif-target', 'Mục tiêu', ['target', 'goal', 'đúng'], '1f3af'),
  gif('gif-coffee', 'Cà phê', ['cà phê', 'coffee', 'break', 'nghỉ'], '2615'),
  gif('gif-pizza', 'Pizza', ['pizza', 'ăn', 'lunch', 'food'], '1f355'),
  gif('gif-laptop', 'Laptop', ['laptop', 'work', 'code', 'làm việc'], '1f4bb'),
  gif('gif-calendar', 'Lịch', ['lịch', 'deadline', 'meeting', 'hẹn'], '23f0'),
  gif('gif-memo', 'Ghi chú', ['note', 'ghi', 'task'], '270f'),
  gif('gif-bell', 'Chuông', ['notify', 'bell', 'thông báo'], '1f514'),
  gif('gif-warning', 'Cảnh báo', ['alert', 'warning', 'chú ý'], '26a0'),
  gif('gif-bug', 'Bug', ['bug', 'lỗi', 'fix'], '1f41b'),
  gif('gif-cat', 'Mèo', ['cat', 'mèo', 'cute'], '1f431'),
  gif('gif-dog', 'Cún', ['dog', 'chó', 'cún', 'cute'], '1f415'),
  gif('gif-birthday', 'Sinh nhật', ['chúc mừng', 'congrats', 'birthday', 'sinh nhật'], '1f382'),
  gif('gif-eyes', 'Nhìn này', ['look', 'xem', 'eyes', 'attention'], '1f440'),
  gif('gif-zany', 'Điên rồ', ['crazy', 'funny', 'wow'], '1f92a'),
  gif('gif-salute-face', 'Kính chào', ['salute', 'kính', 'cảm ơn', 'respect'], '1f44b_1f3fd'),
];

/** @type {ChatMediaItem[]} */
const CHAT_EMOJI_STICKER_ITEMS = [
  sticker('1f600', 'Cười', ['cười', 'vui', 'smile', 'haha']),
  sticker('1f603', 'Cười to', ['cười', 'vui', 'smile']),
  sticker('1f604', 'Cười mắt cười', ['cười', 'vui', 'happy']),
  sticker('1f601', 'Cười toe toét', ['cười', 'vui']),
  sticker('1f606', 'Cười mở miệng', ['cười', 'lol']),
  sticker('1f605', 'Cười mồ hôi', ['cười', 'ngại']),
  sticker('1f923', 'Cười lăn', ['cười', 'lol', 'rofl', 'haha']),
  sticker('1f602', 'Cười ra nước mắt', ['cười', 'lol', 'haha']),
  sticker('1f642', 'Cười nhẹ', ['cười', 'smile']),
  sticker('1f609', 'Nháy mắt', ['nháy', 'wink', 'cute']),
  sticker('1f60a', 'Mỉm cười', ['cười', 'smile', 'vui']),
  sticker('1f970', 'Yêu mến', ['yêu', 'love', 'thích']),
  sticker('1f60d', 'Mắt tim', ['yêu', 'love', 'tim']),
  sticker('1f618', 'Hôn gió', ['hôn', 'kiss', 'yêu']),
  sticker('1f617', 'Hôn', ['hôn', 'kiss']),
  sticker('1f619', 'Hôn mắt cười', ['hôn', 'kiss', 'cười']),
  sticker('1f61a', 'Hôn nhắm mắt', ['hôn', 'kiss']),
  sticker('1f60b', 'Ngon', ['ngon', 'yum', 'food']),
  sticker('1f61b', 'Lè lưỡi', ['troll', 'funny']),
  sticker('1f61c', 'Lè mắt', ['troll', 'funny', 'crazy']),
  sticker('1f61d', 'Nham hiểm', ['troll', 'funny']),
  sticker('1f911', 'Tiền miệng', ['tiền', 'money', 'rich']),
  sticker('1f917', 'Ôm', ['ôm', 'hug']),
  sticker('1f92d', 'Tay che miệng', ['ngại', 'shh']),
  sticker('1f92b', 'Suỵt', ['shh', 'im lặng']),
  sticker('1f914', 'Suy nghĩ', ['suy nghĩ', 'think', 'hmm']),
  sticker('1f928', 'Ngạc nhiên', ['wow', 'ngạc nhiên']),
  sticker('1f610', 'Bình thường', ['neutral', 'bt']),
  sticker('1f611', 'Im lặng', ['im', 'silent']),
  sticker('1f636', 'Im miệng', ['im', 'silent']),
  sticker('1f60f', 'Cười khẩy', ['smirk', 'troll']),
  sticker('1f612', 'Chán', ['chán', 'bored']),
  sticker('1f644', 'Mắt lộn', ['chán', 'sarcasm']),
  sticker('1f62c', 'Cười gượng', ['gượng', 'awkward']),
  sticker('1f62e', 'Mở miệng', ['wow', 'surprise']),
  sticker('1f62f', 'Im hơi', ['surprise', 'wow']),
  sticker('1f632', 'Sốc', ['sốc', 'shock', 'wow']),
  sticker('1f633', 'Xấu hổ', ['xấu hổ', 'blush']),
  sticker('1f97a', 'Cầu xin', ['cầu', 'please', 'xin']),
  sticker('1f979', 'Cảm động', ['cảm động', 'touching']),
  sticker('1f625', 'Buồn mồ hôi', ['buồn', 'sad']),
  sticker('1f622', 'Khóc', ['khóc', 'cry', 'buồn', 'sad']),
  sticker('1f62d', 'Khóc to', ['khóc', 'cry', 'buồn']),
  sticker('1f624', 'Tức', ['tức', 'angry']),
  sticker('1f621', 'Giận', ['giận', 'angry', 'tức']),
  sticker('1f620', 'Giận dữ', ['giận', 'angry']),
  sticker('1f92c', 'Chửi', ['giận', 'swear']),
  sticker('1f634', 'Ngủ', ['ngủ', 'sleep', 'mệt']),
  sticker('1f635', 'Chóng mặt', ['mệt', 'dizzy']),
  sticker('1f912', 'Ốm', ['ốm', 'sick']),
  sticker('1f915', 'Băng đầu', ['ốm', 'hurt']),
  sticker('1f922', 'Buồn nôn', ['ốm', 'sick']),
  sticker('1f927', 'Hắt hơi', ['ốm', 'sick']),
  sticker('1f976', 'Lạnh', ['lạnh', 'cold']),
  sticker('1f975', 'Nóng', ['nóng', 'hot']),
  sticker('1f974', 'Say', ['say', 'drunk']),
  sticker('1f973', 'Party', ['party', 'vui', 'ăn mừng']),
  sticker('1f60e', 'Ngầu', ['ngầu', 'cool']),
  sticker('1f913', 'Nerd', ['nerd', 'dev', 'code']),
  sticker('1f9d0', 'Kính một mắt', ['think', 'detective']),
  sticker('1f615', 'Bối rối', ['confused', 'hmm']),
  sticker('1f616', 'Stress', ['stress', 'mệt']),
  sticker('1f623', 'Kiên trì', ['cố', 'persist']),
  sticker('1f61e', 'Thất vọng', ['thất vọng', 'sad']),
  sticker('1f61f', 'Lo lắng', ['lo', 'worried']),
  sticker('1f626', 'Cau mày', ['cau', 'angry']),
  sticker('1f627', 'Đau khổ', ['đau', 'sad']),
  sticker('1f628', 'Sợ', ['sợ', 'fear']),
  sticker('1f629', 'Mệt mỏi', ['mệt', 'tired']),
  sticker('1f62a', 'Buồn ngủ', ['ngủ', 'sleepy']),
  sticker('1f62b', 'Mệt lắm', ['mệt', 'tired']),
  sticker('1f44d', 'Like', ['like', 'thích', 'ok', 'đồng ý']),
  sticker('1f44e', 'Dislike', ['dislike', 'no', 'không']),
  sticker('1f44c', 'OK', ['ok', 'được', 'yes']),
  sticker('1f44f', 'Vỗ tay', ['vỗ tay', 'clap', 'hay']),
  sticker('1f64c', 'Giơ tay', ['celebrate', 'vui', 'yeah']),
  sticker('1f64f', 'Cảm ơn', ['cảm ơn', 'thanks', 'pray', 'biết ơn']),
  sticker('1f6d1', 'Dừng', ['stop', 'dừng', 'khoan']),
  sticker('1f44b', 'Vẫy tay', ['chào', 'hello', 'bye', 'xin chào']),
  sticker('270b', 'Tay giơ', ['hello', 'stop', 'chào']),
  sticker('1f91a', 'Tay sau', ['stop', 'dừng']),
  sticker('1f590', 'Tay hướng lên', ['hello', 'chào']),
  sticker('1f596', 'Live long', ['star trek', 'vulcan']),
  sticker('1f91d', 'Bắt tay', ['bắt tay', 'handshake', 'deal', 'cảm ơn']),
  sticker('1f91e', 'Chúc may', ['may mắn', 'luck', 'good luck']),
  sticker('1f91f', 'I love you', ['love', 'yêu', 'tim']),
  sticker('1f918', 'Rock', ['rock', 'yeah']),
  sticker('1f919', 'Gọi', ['call', 'gọi']),
  sticker('1f448', 'Trái', ['trái', 'left']),
  sticker('1f449', 'Phải', ['phải', 'right']),
  sticker('1f446', 'Lên', ['lên', 'up']),
  sticker('1f447', 'Xuống', ['xuống', 'down']),
  sticker('1f595', 'Ngón giữa', ['troll', 'angry']),
  sticker('270a', 'Đấm tay', ['power', 'yeah']),
  sticker('1f44a', 'Đấm', ['fight', 'power']),
  sticker('1f932', 'Cầu nguyện', ['cảm ơn', 'thanks', 'pray']),
  sticker('1f450', 'Mở tay', ['what', 'gì']),
  sticker('1f64b', 'Giơ tay hỏi', ['hỏi', 'question']),
  sticker('1f481', 'Lễ tân', ['info', 'hỗ trợ']),
  sticker('1f647', 'Cúi chào', ['cảm ơn', 'xin lỗi', 'sorry', 'thanks']),
  sticker('1f926', 'Facepalm', ['facepalm', 'trời ơi', 'chán']),
  sticker('1f937', 'Shrug', ['shrug', 'không biết', 'chịu']),
  sticker('1f6b6', 'Đi bộ', ['đi', 'walk']),
  sticker('1f3c3', 'Chạy', ['chạy', 'run', 'gấp']),
  sticker('1f46b', 'Cặp đôi', ['couple', 'team']),
  sticker('2764', 'Tim đỏ', ['tim', 'heart', 'love', 'yêu']),
  sticker('1f9e1', 'Tim cam', ['tim', 'heart', 'love']),
  sticker('1f49b', 'Tim vàng', ['tim', 'heart']),
  sticker('1f49a', 'Tim xanh', ['tim', 'heart']),
  sticker('1f499', 'Tim xanh dương', ['tim', 'heart']),
  sticker('1f49c', 'Tim tím', ['tim', 'heart']),
  sticker('1f5a4', 'Tim đen', ['tim', 'dark']),
  sticker('1f90d', 'Tim trắng', ['tim', 'heart']),
  sticker('1f494', 'Tim vỡ', ['tim vỡ', 'sad', 'buồn']),
  sticker('1f495', 'Hai tim', ['yêu', 'love', 'tim']),
  sticker('1f496', 'Tim lấp lánh', ['yêu', 'love', 'tim']),
  sticker('1f497', 'Tim lớn', ['yêu', 'love']),
  sticker('1f498', 'Tim mũi tên', ['yêu', 'love']),
  sticker('1f49d', 'Tim ruy băng', ['yêu', 'love', 'quà']),
  sticker('1f49e', 'Tim bay', ['yêu', 'love']),
  sticker('1f49f', 'Trang trí tim', ['yêu', 'love']),
  sticker('2728', 'Lấp lánh', ['sparkle', 'vui', 'magic']),
  sticker('2b50', 'Sao', ['sao', 'star', 'good']),
  sticker('1f31f', 'Sao sáng', ['sao', 'star']),
  sticker('1f525', 'Fire', ['fire', 'hot', 'ngon', '🔥']),
  sticker('1f4af', '100 điểm', ['100', 'perfect', 'chuẩn', 'điểm']),
  sticker('2705', 'Check', ['done', 'xong', 'ok', 'check']),
  sticker('274c', 'Sai', ['no', 'sai', 'wrong']),
  sticker('2757', 'Chấm than', ['!', 'important']),
  sticker('2753', 'Hỏi', ['?', 'hỏi', 'question']),
  sticker('1f4a1', 'Bóng đèn', ['idea', 'ý tưởng']),
  sticker('1f680', 'Rocket', ['rocket', 'ship', 'launch', 'deploy']),
  sticker('1f389', 'Confetti', ['party', 'vui', 'chúc mừng']),
  sticker('1f38a', 'Confetti ball', ['party', 'vui']),
  sticker('1f3c6', 'Cúp', ['win', 'thắng', 'cup']),
  sticker('1f3af', 'Trúng đích', ['target', 'đúng', 'goal']),
  sticker('1f4aa', 'Cơ bắp', ['mạnh', 'strong', 'power']),
  sticker('1f440', 'Mắt', ['mắt', 'eyes', 'look', 'xem']),
  sticker('1f381', 'Quà', ['quà', 'gift', 'cảm ơn']),
  sticker('1f490', 'Hoa', ['hoa', 'cảm ơn', 'thanks']),
  sticker('2615', 'Cà phê', ['cà phê', 'coffee', 'break']),
  sticker('1f355', 'Pizza', ['pizza', 'ăn', 'food']),
  sticker('1f354', 'Burger', ['burger', 'ăn', 'food']),
  sticker('1f4bb', 'Laptop', ['laptop', 'work', 'code']),
  sticker('1f4bc', 'Cặp', ['work', 'office']),
  sticker('1f4c5', 'Lịch', ['lịch', 'deadline', 'meeting']),
  sticker('1f4dd', 'Ghi chú', ['note', 'ghi', 'task']),
  sticker('1f4ce', 'Đính kèm', ['file', 'attach']),
  sticker('1f4e2', 'Loa', ['announce', 'thông báo']),
  sticker('1f514', 'Chuông', ['notify', 'bell']),
  sticker('1f3c1', 'Cờ đích', ['target', 'goal', 'mục tiêu']),
  sticker('1f6a8', 'Cảnh báo', ['alert', 'warning']),
  sticker('26a0', 'Chú ý', ['warning', 'chú ý']),
  sticker('1f44b-1f3fb', 'Chào', ['chào', 'hello', 'bye']),
  sticker('1f607', 'Thiên thần', ['cảm ơn', 'thanks', 'cute', 'vui']),
  sticker('263a', 'Cười nhẹ', ['cảm ơn', 'thanks', 'vui', 'smile']),
  sticker('1f929', 'Wow thích', ['cảm ơn', 'thanks', 'wow', 'hay']),
  sticker('1f64c-1f3fb', 'Giơ tay vui', ['cảm ơn', 'thanks', 'vui', 'yeah']),
  sticker('1f64f-1f3fb', 'Cảm ơn ạ', ['cảm ơn', 'thanks', 'pray']),
  sticker('1f91d-1f3fb', 'Bắt tay 2', ['cảm ơn', 'thanks', 'deal', 'bắt tay']),
  sticker('1f647-1f3fb', 'Cúi chào 2', ['cảm ơn', 'thanks', 'xin lỗi']),
  sticker('1f338', 'Hoa anh đào', ['cảm ơn', 'thanks', 'hoa', 'quà']),
  sticker('1f339', 'Hoa hồng', ['cảm ơn', 'thanks', 'hoa', 'yêu']),
  sticker('1f4a9', 'Troll', ['troll', 'funny', 'joke']),
  sticker('1f431', 'Mèo', ['cat', 'mèo', 'cute']),
  sticker('1f436', 'Chó', ['dog', 'chó', 'cute']),
  sticker('1f42d', 'Chuột', ['mouse', 'cute']),
  sticker('1f439', 'Hamster', ['hamster', 'cute']),
  sticker('1f430', 'Thỏ', ['rabbit', 'thỏ', 'cute']),
  sticker('1f43b', 'Gấu', ['bear', 'cute', 'ôm']),
  sticker('1f981', 'Sư tử', ['lion', 'strong']),
  sticker('1f984', 'Kỳ lân', ['unicorn', 'magic', 'cute']),
  sticker('1f427', 'Cánh cụt', ['penguin', 'cute']),
  sticker('1f989', 'Cú', ['owl', 'think', 'night']),
  sticker('1f41d', 'Ong', ['bee', 'busy', 'work']),
  sticker('1f980', 'Cua', ['crab', 'troll']),
  sticker('1f419', 'Bạch tuộc', ['octopus', 'dev', 'code']),
  sticker('1f433', 'Cá voi', ['whale', 'big']),
  sticker('1f42f', 'Hổ', ['tiger', 'strong']),
  sticker('1f437', 'Heo', ['pig', 'cute']),
  sticker('1f438', 'Ếch', ['frog', 'funny']),
  sticker('2600', 'Nắng', ['sun', 'nắng', 'vui']),
  sticker('1f319', 'Trăng', ['moon', 'night']),
  sticker('26c5', 'Mây nắng', ['cloud', 'weather']),
  sticker('1f327', 'Mưa', ['rain', 'mưa', 'buồn']),
  sticker('26a1', 'Sét', ['lightning', 'fast', 'gấp']),
  sticker('1f30a', 'Sóng', ['wave', 'ocean']),
  sticker('1f33b', 'Hướng dương', ['flower', 'vui']),
  sticker('1f340', 'Cỏ 4 lá', ['luck', 'may mắn']),
  sticker('1f36b', 'Socola', ['chocolate', 'ăn', 'quà']),
  sticker('1f370', 'Bánh', ['cake', 'party', 'sinh nhật']),
  sticker('1f382', 'Bánh kem', ['birthday', 'party', 'chúc mừng']),
  sticker('1f961', 'Bánh mì', ['bread', 'ăn']),
  sticker('1f35c', 'Mì', ['noodle', 'ăn', 'lunch']),
  sticker('1f363', 'Sushi', ['sushi', 'ăn']),
  sticker('1f964', 'Trà sữa', ['drink', 'trà', 'break']),
  sticker('1f37a', 'Bia', ['beer', 'party', 'weekend']),
  sticker('1f4ca', 'Biểu đồ', ['chart', 'report', 'data']),
  sticker('1f4cb', 'Clipboard', ['task', 'list', 'checklist']),
  sticker('1f4cc', 'Ghim', ['pin', 'note']),
  sticker('1f4e7', 'Email', ['email', 'mail', 'work']),
  sticker('1f4de', 'Gọi điện', ['call', 'phone', 'meeting']),
  sticker('1f3a7', 'Tai nghe', ['headphone', 'call', 'meeting']),
  sticker('1f4f1', 'Điện thoại', ['phone', 'mobile']),
  sticker('1f512', 'Khóa', ['lock', 'security', 'private']),
  sticker('1f513', 'Mở khóa', ['unlock', 'open']),
  sticker('1f6e0', 'Công cụ', ['tool', 'fix', 'sửa']),
  sticker('2699', 'Bánh răng', ['settings', 'config']),
  sticker('1f4be', 'Floppy', ['save', 'lưu']),
  sticker('1f4c1', 'Thư mục', ['folder', 'file']),
  sticker('1f4c4', 'Tài liệu', ['doc', 'file', 'pdf']),
];

/** Sticker: cụm từ VN trước (kiểu Zalo), rồi emoji Twemoji. */
export const CHAT_STICKER_ITEMS = [...CHAT_PHRASE_STICKER_ITEMS, ...CHAT_EMOJI_STICKER_ITEMS];

/** Đồng nghĩa tìm kiếm — cụm từ hằng ngày ↔ tag tiếng Anh / gần nghĩa. */
const SEARCH_ALIASES = {
  'xin loi': ['xin loi', 'sorry', 'tha loi', 'loi'],
  sorry: ['xin loi', 'sorry', 'tha loi'],
  'cam on': ['cam on', 'thanks', 'thank', 'da ta', 'biet on'],
  thanks: ['cam on', 'thanks', 'thank', 'da ta'],
  'da ta': ['da ta', 'cam on', 'thanks'],
  da: ['da', 'vang', 'yes', 'ok'],
  vang: ['da', 'vang', 'yes', 'ok'],
  'tam biet': ['tam biet', 'bye', 'goodbye', 'chao'],
  bye: ['tam biet', 'bye', 'goodbye'],
  chao: ['chao', 'hello', 'hi', 'xin chao', 'bye'],
  hello: ['chao', 'hello', 'hi', 'xin chao'],
  giup: ['giup', 'help', 'nho', 'please'],
  help: ['giup', 'help', 'nho', 'please'],
  'ngu ngon': ['ngu ngon', 'sleep', 'ngu', 'good night'],
  'an com': ['an com', 'an', 'food', 'lunch', 'com'],
  'chuc mung': ['chuc mung', 'congrats', 'mung', 'party'],
  khong: ['khong', 'no', 'tu choi'],
  duoc: ['duoc', 'ok', 'yes', 'dong y'],
  doi: ['doi', 'cho', 'wait', 'khoan'],
  met: ['met', 'tired', 'ngu'],
  vui: ['vui', 'happy', 'haha', 'party'],
};

function normalizeSearchText(value) {
  return String(value || '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

function expandSearchAliases(query) {
  const q = normalizeSearchText(query);
  if (!q) return [];
  const aliases = new Set([q]);
  const direct = SEARCH_ALIASES[q];
  if (direct) direct.forEach((a) => aliases.add(a));

  // Chỉ mở rộng khi khớp đúng key/value — tránh "đa tạ" kéo theo "dạ"
  for (const [key, values] of Object.entries(SEARCH_ALIASES)) {
    if (key === q || values.includes(q)) {
      aliases.add(key);
      values.forEach((a) => aliases.add(a));
    }
  }
  return [...aliases];
}

/** @param {ChatMediaItem[]} items @param {string} query */
export function filterChatMediaItems(items, query) {
  const q = normalizeSearchText(query);
  if (!q) return items;
  const aliasQueries = expandSearchAliases(q);
  return items.filter((item) => {
    const tagList = (item.tags || []).map((tag) => normalizeSearchText(tag)).filter(Boolean);
    const labelN = normalizeSearchText(item.label);
    const haystack = normalizeSearchText(
      [item.label, ...(item.tags || []), item.id.replace(/^(gif|stk)-/, '').replace(/-/g, ' ')].join(' ')
    );
    const words = haystack.split(/[^a-z0-9]+/).filter(Boolean);
    return aliasQueries.some((alias) => {
      const tokens = alias.split(/\s+/).filter(Boolean);
      return tokens.every((token) => {
        if (token.length <= 2) {
          // Tránh "dạ" khớp nhầm "đa tạ" chỉ vì cùng chữ "da"
          return tagList.includes(token) || labelN === token;
        }
        return words.some((word) => word.includes(token)) || haystack.includes(token);
      });
    });
  });
}
