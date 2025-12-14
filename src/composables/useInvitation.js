import { ref, computed } from 'vue';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs,
  updateDoc,
  doc,
  onSnapshot,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase-init.js';
import { useAuthStore } from '../store/modules/auth.js';

/**
 * Composable for game invitations
 */
export function useInvitation() {
  const authStore = useAuthStore();
  
  const invitations = ref([]);
  const loading = ref(false);
  const error = ref('');
  
  let unsubscribeInvitations = null;

  const pendingInvitations = computed(() => 
    invitations.value.filter(inv => inv.status === 'pending')
  );

  /**
   * Send invitation to friend
   */
  const sendInvitation = async (friendUid, friendName, gameId, gameName, roomCode) => {
    if (!authStore.user) return null;
    
    loading.value = true;
    error.value = '';
    
    try {
      const invitation = {
        fromUid: authStore.user.uid,
        fromName: authStore.displayName,
        toUid: friendUid,
        toName: friendName,
        gameId,
        gameName,
        roomCode,
        status: 'pending',
        createdAt: serverTimestamp()
      };
      
      const docRef = await addDoc(
        collection(db, 'users', friendUid, 'invitations'),
        invitation
      );
      
      return docRef.id;
    } catch (err) {
      console.error('Send invitation error:', err);
      error.value = 'Failed to send invitation: ' + err.message;
      return null;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Load user's invitations (realtime listener)
   */
  const loadInvitations = () => {
    if (!authStore.user) return;
    
    if (unsubscribeInvitations) {
      unsubscribeInvitations();
    }
    
    const invitationsRef = collection(db, 'users', authStore.user.uid, 'invitations');
    const q = query(invitationsRef, where('status', '==', 'pending'));
    
    unsubscribeInvitations = onSnapshot(q, (snapshot) => {
      const invs = [];
      snapshot.forEach((doc) => {
        invs.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      // Sort by creation time, newest first
      invitations.value = invs.sort((a, b) => {
        const aTime = a.createdAt?.toMillis() || 0;
        const bTime = b.createdAt?.toMillis() || 0;
        return bTime - aTime;
      });
    });
  };

  /**
   * Accept invitation
   */
  const acceptInvitation = async (invitationId) => {
    if (!authStore.user) return false;
    
    loading.value = true;
    try {
      const invitationRef = doc(db, 'users', authStore.user.uid, 'invitations', invitationId);
      await updateDoc(invitationRef, {
        status: 'accepted',
        acceptedAt: serverTimestamp()
      });
      
      return true;
    } catch (err) {
      console.error('Accept invitation error:', err);
      error.value = 'Failed to accept invitation: ' + err.message;
      return false;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Reject invitation
   */
  const rejectInvitation = async (invitationId) => {
    if (!authStore.user) return false;
    
    loading.value = true;
    try {
      const invitationRef = doc(db, 'users', authStore.user.uid, 'invitations', invitationId);
      await updateDoc(invitationRef, {
        status: 'rejected',
        rejectedAt: serverTimestamp()
      });
      
      return true;
    } catch (err) {
      console.error('Reject invitation error:', err);
      error.value = 'Failed to reject invitation: ' + err.message;
      return false;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Cleanup listener
   */
  const cleanup = () => {
    if (unsubscribeInvitations) {
      unsubscribeInvitations();
      unsubscribeInvitations = null;
    }
  };

  return {
    invitations,
    pendingInvitations,
    loading,
    error,
    sendInvitation,
    loadInvitations,
    acceptInvitation,
    rejectInvitation,
    cleanup
  };
}
