import { createClient } from '@supabase/supabase-js';
let _client = null;
function getClient() {
    if (!_client) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !key)
            throw new Error('Supabase env vars not set');
        _client = createClient(url, key);
    }
    return _client;
}
export const supabase = new Proxy({}, {
    get(_, prop) {
        return getClient()[prop];
    },
});
