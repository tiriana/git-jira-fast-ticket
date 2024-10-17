export const safe = (fn) => {
    try {
        return fn();
    }
    catch {
        return null;
    }
};
