/* Copyright (c) 2021-25 MIT 6.102/6.031 course staff, all rights reserved.
 * Redistribution of original or derived work requires permission of course staff.
 */
/**
 * Polyfill for Promise.withResolvers() which is not available in Node.js < 22.x
 * This adds the missing functionality to the Promise constructor.
 */
if (typeof Promise.withResolvers === 'undefined') {
    Promise.withResolvers = function () {
        let resolve;
        let reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
    };
}
export {};
//# sourceMappingURL=polyfill.js.map