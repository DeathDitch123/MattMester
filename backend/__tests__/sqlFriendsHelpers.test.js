/**
 * sql/modules/friends.js — pure helper funkciok tesztjei.
 */

jest.mock('../sql/database.js', () => ({
    getPool: jest.fn()
}));

jest.mock('../sql/modules/profileImage.js', () => ({
    applyProfileImageVisibility: jest.fn((path, status) => ({
        profileImage: path || '/default.png',
        profileImageStatus: status || 'approved'
    }))
}));

const { normalizeFriendPair, buildFriendListItem } = require('../sql/modules/friends.js');

describe('normalizeFriendPair — szam-rendezett par', () => {
    test('kisebb-elsobb sorrend', () => {
        expect(normalizeFriendPair(5, 1)).toEqual([1, 5]);
        expect(normalizeFriendPair(1, 5)).toEqual([1, 5]);
    });

    test('egyenlo userek (edge — nem kellene de input-validacio kerdes)', () => {
        expect(normalizeFriendPair(7, 7)).toEqual([7, 7]);
    });

    test('string szamokat is sorbal allitja Number-koerszional', () => {
        const r = normalizeFriendPair('5', '10');
        // String compare-rel '10' < '5' lenne — Number compare-rel 5 < 10
        expect(Number(r[0])).toBeLessThanOrEqual(Number(r[1]));
    });
});

describe('buildFriendListItem — relation flags', () => {
    const baseRow = {
        id: 5,
        username: 'rival',
        profile_image: '/foo.png',
        profile_image_status: 'approved',
        own_block_active: 0,
        opposite_block_active: 0
    };

    test('"friends" status: canChat=true, canDeleteFriend=true', () => {
        const r = buildFriendListItem(baseRow, 'friends', 7);
        expect(r.canChat).toBe(true);
        expect(r.canDeleteFriend).toBe(true);
        expect(r.canView).toBe(true);
    });

    test('"incoming_pending" status: canAccept/canReject/canBlock=true', () => {
        const r = buildFriendListItem(baseRow, 'incoming_pending', 7);
        expect(r.canAccept).toBe(true);
        expect(r.canReject).toBe(true);
        expect(r.canBlock).toBe(true);
        expect(r.canChat).toBe(false);
    });

    test('"none" status: nincs action engedelyezve', () => {
        const r = buildFriendListItem(baseRow, 'none', 7);
        expect(r.canChat).toBe(false);
        expect(r.canAccept).toBe(false);
        expect(r.canDeleteFriend).toBe(false);
    });

    test('saját tiltas → canUnblock=true', () => {
        const r = buildFriendListItem({ ...baseRow, own_block_active: 1 }, 'blocked_by_me', 7);
        expect(r.canUnblock).toBe(true);
    });

    test('"blocked_*" status: canView=true (mert isBlockedContext)', () => {
        const r = buildFriendListItem(baseRow, 'blocked_by_me', 7);
        expect(r.isBlockedContext).toBe(true);
        expect(r.canView).toBe(true);
    });

    test('userId + username eltarolva', () => {
        const r = buildFriendListItem(baseRow, 'friends', 7);
        expect(r.userId).toBe(5);
        expect(r.username).toBe('rival');
    });

    test('default relationStatus = "none"', () => {
        const r = buildFriendListItem(baseRow, null, 7);
        expect(r.relationStatus).toBe('none');
    });
});
