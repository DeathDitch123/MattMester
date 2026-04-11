/**
 * Chat Rate Limiter - Unit Tests
 * Tests for rate limiting functionality and cleanup
 */

describe('Chat Rate Limiter Unit Tests', () => {
    // Note: These are example tests showing how to test rate limiter
    // The actual rate limiter logic is in api.js
    
    test('rate limiter should track user messages', () => {
        // Example test structure for rate limiter
        const rateLimitMap = new Map();
        const RATE_LIMIT_WINDOW = 10 * 1000; // 10s
        const MAX_MESSAGES = 5;
        
        const userId = 1;
        const now = Date.now();
        
        // Simulate adding messages
        if (!rateLimitMap.has(userId)) {
            rateLimitMap.set(userId, []);
        }
        
        const timestamps = rateLimitMap.get(userId);
        timestamps.push(now);
        
        expect(timestamps.length).toBe(1);
    });

    test('cleanup function should remove old timestamps', () => {
        const rateLimitMap = new Map();
        const RATE_LIMIT_WINDOW = 10 * 1000;
        
        const userId = 1;
        const oldTime = Date.now() - 20 * 1000; // 20s ago
        const recentTime = Date.now() - 5 * 1000; // 5s ago
        
        rateLimitMap.set(userId, [oldTime, recentTime]);
        
        // Simulate cleanup
        const now = Date.now();
        const threshold = now - RATE_LIMIT_WINDOW;
        const freshTimestamps = rateLimitMap.get(userId).filter(ts => ts > threshold);
        
        expect(freshTimestamps.length).toBe(1);
        expect(freshTimestamps[0]).toBe(recentTime);
    });

    test('cleanup should delete empty user entries', () => {
        const rateLimitMap = new Map();
        const RATE_LIMIT_WINDOW = 10 * 1000;
        
        const userId1 = 1;
        const userId2 = 2;
        
        const oldTime = Date.now() - 20 * 1000;
        rateLimitMap.set(userId1, [oldTime]);
        rateLimitMap.set(userId2, [Date.now()]); // Recent
        
        // Simulate cleanup
        const now = Date.now();
        const threshold = now - RATE_LIMIT_WINDOW;
        
        for (const [userId, timestamps] of rateLimitMap.entries()) {
            const freshTimestamps = timestamps.filter(ts => ts > threshold);
            if (freshTimestamps.length === 0) {
                rateLimitMap.delete(userId);
            }
        }
        
        expect(rateLimitMap.has(userId1)).toBe(false);
        expect(rateLimitMap.has(userId2)).toBe(true);
    });

    test('rate limit should trigger at threshold', () => {
        const MAX_MESSAGES = 5;
        const RATE_LIMIT_WINDOW = 10 * 1000;
        
        const rateLimitMap = new Map();
        const userId = 1;
        const now = Date.now();
        
        // Add messages up to limit
        const timestamps = [];
        for (let i = 0; i < MAX_MESSAGES; i++) {
            timestamps.push(now);
        }
        
        rateLimitMap.set(userId, timestamps);
        
        // Check if limit is exceeded
        const freshTimestamps = rateLimitMap.get(userId)
            .filter(ts => now - ts < RATE_LIMIT_WINDOW);
        
        expect(freshTimestamps.length).toBe(MAX_MESSAGES);
        expect(freshTimestamps.length >= MAX_MESSAGES).toBe(true); // Should limit
    });

    test('concurrent cleanup should not corrupt data', () => {
        const rateLimitMap = new Map();
        
        // Simulate concurrent access
        const user1 = 1, user2 = 2, user3 = 3;
        rateLimitMap.set(user1, [Date.now()]);
        rateLimitMap.set(user2, [Date.now() - 20 * 1000]); // Old
        rateLimitMap.set(user3, [Date.now(), Date.now()]);
        
        // Cleanup
        const RATE_LIMIT_WINDOW = 10 * 1000;
        const now = Date.now();
        const threshold = now - RATE_LIMIT_WINDOW;
        
        const usersToClean = Array.from(rateLimitMap.keys());
        usersToClean.forEach(userId => {
            const timestamps = rateLimitMap.get(userId);
            const fresh = timestamps.filter(ts => ts > threshold);
            if (fresh.length === 0) {
                rateLimitMap.delete(userId);
            } else {
                rateLimitMap.set(userId, fresh);
            }
        });
        
        expect(rateLimitMap.has(user1)).toBe(true);
        expect(rateLimitMap.has(user2)).toBe(false);
        expect(rateLimitMap.has(user3)).toBe(true);
    });
});

describe('Chat Rate Limiter Performance', () => {
    test('cleanup with many users should complete quickly', () => {
        const rateLimitMap = new Map();
        const RATE_LIMIT_WINDOW = 10 * 1000;
        
        // Simulate 10,000 users
        for (let i = 1; i <= 10000; i++) {
            const timestamps = [];
            for (let j = 0; j < 5; j++) {
                timestamps.push(Date.now() - Math.random() * 20000);
            }
            rateLimitMap.set(i, timestamps);
        }
        
        const start = Date.now();
        
        // Cleanup
        const now = Date.now();
        const threshold = now - RATE_LIMIT_WINDOW;
        const usersToDelete = [];
        
        for (const [userId, timestamps] of rateLimitMap.entries()) {
            const fresh = timestamps.filter(ts => ts > threshold);
            if (fresh.length === 0) {
                usersToDelete.push(userId);
            }
        }
        
        usersToDelete.forEach(userId => rateLimitMap.delete(userId));
        
        const duration = Date.now() - start;
        expect(duration).toBeLessThan(1000); // Should complete in < 1 second
    });
});
