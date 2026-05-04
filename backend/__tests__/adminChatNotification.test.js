/**
 * backend/api/routes/chat.js — admin -> user chat notification side-effect.
 *
 * Amikor egy adminisztrator direkt uzenetet kuld egy felhasznalonak a
 * `/api/chat/conversations/:conversationId/messages` POST endpointon
 * keresztul, a chat-message broadcast mellett egy notification entry-t
 * is letre kell hozni a `notificationService.send()`-en at, hogy a
 * felhasznalo csengo-ikonja es toast-ja is jelezze az uzenetet.
 *
 * Ez a teszt SOURCE-LEVEL (nem futo HTTP) valid, hogy:
 *   1) a chat.js POST handler hivja a notificationService.send-et
 *   2) a hivas csak akkor tortenik, ha a sender role === 'admin'
 *   3) a notification type === 'chat_message_from_admin'
 *   4) a `getPrivateConversationParticipantIds` szuri ki a sajat user-t
 */

const fs = require('fs');
const path = require('path');

const CHAT_ROUTE_PATH = path.join(__dirname, '..', 'api', 'routes', 'chat.js');
const SERVICES_PATH = path.join(__dirname, '..', 'services.js');
const NOTIF_TOAST_PATH = path.join(__dirname, '..', '..', 'frontend', 'javascript', 'shared', 'notificationToast.js');
const NOTIF_EVENTS_PATH = path.join(__dirname, '..', '..', 'frontend', 'javascript', 'profile', '04-notificationEvents.js');

let chatRouteSource;
let servicesSource;
let notifToastSource;
let notifEventsSource;

beforeAll(() => {
    chatRouteSource = fs.readFileSync(CHAT_ROUTE_PATH, 'utf8');
    servicesSource = fs.readFileSync(SERVICES_PATH, 'utf8');
    notifToastSource = fs.readFileSync(NOTIF_TOAST_PATH, 'utf8');
    notifEventsSource = fs.readFileSync(NOTIF_EVENTS_PATH, 'utf8');
});

describe('chat.js — admin chat -> notification side-effect', () => {
    test('importalja a notificationService-t', () => {
        expect(chatRouteSource).toMatch(/notificationService\b/);
        expect(chatRouteSource).toMatch(/require\(['"]\.\.\/\.\.\/services\.js['"]\)/);
    });

    test('a POST /chat/conversations/:id/messages hivja a notificationService.send-et', () => {
        // A handler-en belul kell hogy szerepeljen
        const handlerMatch = chatRouteSource.match(/router\.post\(\s*['"]\/chat\/conversations\/:conversationId\/messages['"][\s\S]*?\n\}\);/);
        expect(handlerMatch).not.toBeNull();
        const handlerBody = handlerMatch[0];
        expect(handlerBody).toMatch(/notificationService\.send\s*\(/);
    });

    test('csak admin sender eseten kuld notification-t (role check jelen van)', () => {
        // Vagy `senderRole === 'admin'` vagy `request.session.role` checkelve.
        const handlerMatch = chatRouteSource.match(/router\.post\(\s*['"]\/chat\/conversations\/:conversationId\/messages['"][\s\S]*?\n\}\);/);
        const handlerBody = handlerMatch[0];
        expect(handlerBody).toMatch(/session\??\.?role|senderRole/);
        expect(handlerBody).toMatch(/['"]admin['"]/);
    });

    test('notification type === chat_message_from_admin', () => {
        expect(chatRouteSource).toMatch(/['"]chat_message_from_admin['"]/);
    });

    test('a sajat userId-t kiszuri a recipient listabol', () => {
        // A recipientIds szures: id !== currentUserId
        expect(chatRouteSource).toMatch(/id\s*!==\s*currentUserId|filter\([^)]*currentUserId/);
    });

    test('hasznalja a getPrivateConversationParticipantIds helper-t', () => {
        expect(chatRouteSource).toMatch(/getPrivateConversationParticipantIds\s*\(/);
    });

    test('audience-t multi vagy user-re allitja a recipient szam fuggvenyeben', () => {
        // multi audience >= 2 fo, user audience egyetlen target
        expect(chatRouteSource).toMatch(/audience:\s*recipientIds\.length\s*===\s*1\s*\?\s*['"]user['"]\s*:\s*['"]multi['"]/);
    });

    test('hibakezeles: try/catch koruleli a notification side-effect-et (ne torje meg a chat send-et)', () => {
        // A notification logika korul try { ... } catch (...) { console.warn(...); } legyen.
        // A "admin notification side-effect" stringet a console.warn argumentumakent
        // hasznaljuk markerkent — a kornyezo blokk teljes try/catch-csel rendelkezik.
        expect(chatRouteSource).toMatch(/notificationService\.send\([\s\S]{0,800}?\}\s*catch\s*\([^)]*\)[\s\S]{0,300}?console\.warn[\s\S]{0,200}?admin notification side-effect/);
    });
});

describe('services.js — notificationService support', () => {
    test('exportalja a notificationService-t', () => {
        expect(servicesSource).toMatch(/notificationService\s*=/);
        expect(servicesSource).toMatch(/module\.exports[\s\S]*notificationService/);
    });

    test('user/multi audience tamogatott', () => {
        expect(servicesSource).toMatch(/audience\s*===\s*['"]user['"]/);
        expect(servicesSource).toMatch(/audience\s*===\s*['"]multi['"]/);
    });

    test('multi audience targetUserIds tomboket fogad', () => {
        const multiBlock = servicesSource.match(/audience\s*===\s*['"]multi['"][\s\S]{0,1500}?\}/);
        expect(multiBlock).not.toBeNull();
        expect(multiBlock[0]).toMatch(/targetUserIds/);
    });
});

describe('frontend notificationToast.js — globalis toast widget', () => {
    test('a fajl letezik es nem ures', () => {
        expect(notifToastSource.length).toBeGreaterThan(500);
    });

    test('window.MattMesterNotificationToast.show publikus API', () => {
        expect(notifToastSource).toMatch(/window\.MattMesterNotificationToast\s*=\s*\{[\s\S]*show/);
    });

    test('felismeri a chat_message_from_admin tipust kulonleges ikonnal', () => {
        expect(notifToastSource).toMatch(/chat_message_from_admin/);
    });

    test('mattmester:notification:push esemenyre kotve van fallback toast-ra', () => {
        expect(notifToastSource).toMatch(/addEventListener\(['"]mattmester:notification:push['"]/);
    });

    test('auto-dismiss timer (setTimeout)', () => {
        expect(notifToastSource).toMatch(/AUTO_DISMISS_MS|setTimeout\([^,]*dismiss/);
    });

    test('max-toasts korlat (stack trim)', () => {
        expect(notifToastSource).toMatch(/MAX_TOASTS|removeChild|trimStack/);
    });
});

describe('frontend 04-notificationEvents.js — toast trigger', () => {
    test('hivja a MattMesterNotificationToast.show-t a push event-en', () => {
        expect(notifEventsSource).toMatch(/MattMesterNotificationToast\?\.\s*show|MattMesterNotificationToast\.show/);
    });

    test('beallitja a __mmNotifCenterBound flag-et a duplikacio-elkerulesere', () => {
        expect(notifEventsSource).toMatch(/__mmNotifCenterBound\s*=\s*true/);
    });
});
