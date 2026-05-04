/**
 * Issue #5 — admin chat menupont -> lebego FAB ikon (mint profile-on).
 * A regi `chat` sidebar-fa NAV_TREE bejegyzes torlodott, a chatModal-t
 * mostantol a `#fabOpenChatButton` FAB indirekt nyitja meg.
 */
const fs = require('fs');
const path = require('path');

const ADMIN_HTML = fs.readFileSync(
    path.resolve(__dirname, '..', 'html', 'adminPanel.html'),
    'utf8'
);
const NAV_JS = fs.readFileSync(
    path.resolve(__dirname, '..', 'javascript', 'adminPanel', '04-navigation.js'),
    'utf8'
);
const FAB_CSS = fs.readFileSync(
    path.resolve(__dirname, '..', 'css', 'shared', 'fabChat.css'),
    'utf8'
);

describe('#5 admin FAB chat', () => {
    test('adminPanel.html tartalmazza a fab-chat gombot', () => {
        expect(ADMIN_HTML).toMatch(/id=["']fabOpenChatButton["']/);
        expect(ADMIN_HTML).toMatch(/class=["']fab-chat["']/);
    });

    test('adminPanel.html linkeli a shared/fabChat.css-t', () => {
        expect(ADMIN_HTML).toMatch(/css\/shared\/fabChat\.css/);
    });

    test('a FAB onclick a MattMesterChatModal.openInbox()-t hivja', () => {
        const re = /id=["']fabOpenChatButton["'][\s\S]{0,400}MattMesterChatModal[\s\S]{0,80}openInbox/;
        expect(ADMIN_HTML).toMatch(re);
    });

    test('NAV_TREE-bol torolve a regi `chat` leaf bejegyzes', () => {
        // A `customClick: 'openAdminChatInbox(event)'` mar nem szerepelhet
        // listaelemkent — a FAB veszi at a feladatot.
        expect(NAV_JS).not.toMatch(/customClick:\s*['"]openAdminChatInbox\(event\)['"]/);
        // Es a NAV_TREE-ben sincs `id: 'chat'` leaf
        expect(NAV_JS).not.toMatch(/\{\s*id:\s*['"]chat['"][^}]*leaf:\s*true/);
    });

    test('shared/fabChat.css definialja a .fab-chat es @keyframes floatBounce-t', () => {
        expect(FAB_CSS).toMatch(/\.fab-chat\s*\{/);
        expect(FAB_CSS).toMatch(/@keyframes\s+floatBounce/);
        expect(FAB_CSS).toMatch(/position\s*:\s*fixed/);
    });
});
