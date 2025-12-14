import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { auth, db } from './firebase-init.js';
import { state, setLoading } from './store.js';

export const handleAuth = async (action, form) => {
    setLoading(true);
    state.error = '';
    try {
        if (action === 'register') {
            const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
            await updateProfile(cred.user, { displayName: form.name });
            await setDoc(doc(db, 'users', cred.user.uid), { 
                name: form.name, 
                email: form.email, 
                createdAt: Date.now() 
            });
        } else {
            await signInWithEmailAndPassword(auth, form.email, form.password);
        }
    } catch (e) {
        console.error("Auth Error:", e);
        state.error = e.message;
    } finally {
        setLoading(false);
    }
};

export const guestLogin = async () => {
    setLoading(true);
    state.error = '';
    try {
        console.log("Attempting guest login...");
        await signInAnonymously(auth);
        console.log("Guest login success");
    } catch (e) {
        console.error("Guest Auth Error:", e);
        state.error = "訪客登入失敗: " + e.message;
    } finally {
        setLoading(false);
    }
};

export const logout = async () => {
    await signOut(auth);
    state.user = null;
    state.game = null;
    state.view = 'LoginView';
};
