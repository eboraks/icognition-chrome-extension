import { ref, } from 'vue'
import { firebase, auth, signInWithCredential, GoogleAuthProvider } from '../firebase/config'

const user = ref(null)
const error_message = ref(null)

// Handle user signin
const handleSignIn = function(e) {
    e.preventDefault()
    console.log('before signed in user -> ', auth.currentUser)
    chrome.identity.getAuthToken({ interactive: true }, token =>
    {
        if (chrome.runtime.lastError || !token) {
        console.log(`SSO ended with an error 1: ${JSON.stringify(chrome.runtime.lastError)}`)
        return
    }
    signInWithCredential(auth, GoogleAuthProvider.credential(null, token))
        .then(res =>
        {
            user.value = auth.currentUser
            error_message.value = null
            console.log('signed in user -> ', auth.currentUser)
            chrome.storage.session.set({ session_user: auth.currentUser }).then(() => {
                console.log("signIn => authproof saved!");
            });
        })
        .catch(err =>
        {
        console.log(`SSO ended with an error: ${err}`)
        })
    })
}
const handleSignOut = function () {
    
    auth.signOut().then(() => {
        console.log('signed out! user: ', auth.currentUser)
        user.value = null
    }).catch((error) => {
    console.error('error signing out: ', error)
    });
}


const useAuth = () => {
    return { user, handleSignIn, handleSignOut }
}

export default useAuth