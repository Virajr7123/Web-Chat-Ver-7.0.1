"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Phone, PhoneOff, Video } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { ref, onValue, set, get } from "firebase/database"
import { database } from "@/lib/firebase"

interface IncomingCall {
  id: string
  callerId: string
  callerName: string
  callerAvatar?: string
  type: "voice" | "video"
  timestamp: number
}

interface IncomingCallNotificationProps {
  onAccept: (call: IncomingCall) => void
  onReject: (callId: string) => void
}

export default function IncomingCallNotification({ onAccept, onReject }: IncomingCallNotificationProps) {
  const { currentUser } = useAuth()
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null)
  const [isRinging, setIsRinging] = useState(false)

  // Listen for incoming calls
  useEffect(() => {
    if (!currentUser) return

    console.log("Setting up incoming call listener for user:", currentUser.uid)

    const callsRef = ref(database, "calls")
    const unsubscribe = onValue(callsRef, async (snapshot) => {
      if (!snapshot.exists()) {
        console.log("No calls in database")
        return
      }

      const calls = snapshot.val()
      console.log("Checking calls:", calls)

      let foundIncomingCall: IncomingCall | null = null

      // Look for incoming calls for current user
      for (const [callId, callData] of Object.entries(calls) as [string, any][]) {
        console.log("Checking call:", callId, callData)

        if (
          callData.calleeId === currentUser.uid &&
          callData.status === "calling" &&
          Date.now() - callData.createdAt < 60000 // Only show calls less than 1 minute old
        ) {
          console.log("Found incoming call for current user:", callId)

          try {
            // Get caller info
            const callerRef = ref(database, `users/${callData.callerId}`)
            const callerSnapshot = await get(callerRef)

            if (callerSnapshot.exists()) {
              const callerData = callerSnapshot.val()
              foundIncomingCall = {
                id: callId,
                callerId: callData.callerId,
                callerName: callerData.name || callerData.email?.split("@")[0] || "Unknown",
                callerAvatar: callerData.avatar,
                type: callData.type,
                timestamp: callData.createdAt,
              }
              console.log("Created incoming call object:", foundIncomingCall)
            }
          } catch (error) {
            console.error("Error getting caller info:", error)
          }
          break
        }
      }

      console.log("Setting incoming call:", foundIncomingCall)
      setIncomingCall(foundIncomingCall)
      setIsRinging(!!foundIncomingCall)

      // Auto-dismiss after 30 seconds
      if (foundIncomingCall) {
        setTimeout(() => {
          console.log("Auto-dismissing call after 30 seconds")
          if (incomingCall?.id === foundIncomingCall.id) {
            handleReject(foundIncomingCall.id)
          }
        }, 30000)
      }
    })

    return () => {
      console.log("Cleaning up incoming call listener")
      unsubscribe()
    }
  }, [currentUser])

  // Play ringtone
  useEffect(() => {
    const audio: HTMLAudioElement | null = null

    if (isRinging) {
      // Create a simple ringtone using Web Audio API
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()

      const playRingtone = () => {
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()

        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)

        oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.5)

        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1)

        oscillator.start(audioContext.currentTime)
        oscillator.stop(audioContext.currentTime + 1)
      }

      const ringtoneInterval = setInterval(playRingtone, 2000)
      playRingtone() // Play immediately

      return () => {
        clearInterval(ringtoneInterval)
        audioContext.close()
      }
    }
  }, [isRinging])

  const handleAccept = () => {
    if (incomingCall) {
      setIsRinging(false)
      onAccept(incomingCall)
      setIncomingCall(null)
    }
  }

  const handleReject = async (callId: string) => {
    try {
      await set(ref(database, `calls/${callId}/status`), "rejected")
      setIsRinging(false)
      onReject(callId)
      setIncomingCall(null)
    } catch (error) {
      console.error("Error rejecting call:", error)
    }
  }

  if (!incomingCall) return null

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-8 text-white text-center max-w-sm w-full shadow-2xl border border-white/10"
          initial={{ scale: 0.8, y: 50 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.8, y: 50 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          {/* Caller Avatar */}
          <motion.div
            className="relative mx-auto mb-6"
            animate={{
              scale: [1, 1.05, 1],
            }}
            transition={{
              duration: 2,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
          >
            <Avatar className="h-24 w-24 mx-auto border-4 border-white/20 shadow-xl">
              <AvatarImage src={incomingCall.callerAvatar || "/placeholder.svg?height=96&width=96"} />
              <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500 text-white text-xl">
                {incomingCall.callerName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            {/* Pulse Animation */}
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-white/30"
              animate={{
                scale: [1, 1.5, 2],
                opacity: [0.8, 0.3, 0],
              }}
              transition={{
                duration: 2,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeOut",
              }}
            />
          </motion.div>

          {/* Caller Name */}
          <h3 className="text-2xl font-bold mb-2">{incomingCall.callerName}</h3>

          {/* Call Type */}
          <div className="flex items-center justify-center space-x-2 mb-6">
            {incomingCall.type === "video" ? (
              <Video className="h-5 w-5 text-blue-400" />
            ) : (
              <Phone className="h-5 w-5 text-green-400" />
            )}
            <span className="text-white/80">Incoming {incomingCall.type} call</span>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center space-x-8">
            {/* Reject Button */}
            <motion.button
              className="p-4 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg"
              onClick={() => handleReject(incomingCall.id)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              animate={{
                boxShadow: [
                  "0 0 0 0 rgba(239, 68, 68, 0.7)",
                  "0 0 0 10px rgba(239, 68, 68, 0)",
                  "0 0 0 0 rgba(239, 68, 68, 0)",
                ],
              }}
              transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
            >
              <PhoneOff className="h-6 w-6" />
            </motion.button>

            {/* Accept Button */}
            <motion.button
              className="p-4 rounded-full bg-green-500 hover:bg-green-600 text-white shadow-lg"
              onClick={handleAccept}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              animate={{
                boxShadow: [
                  "0 0 0 0 rgba(34, 197, 94, 0.7)",
                  "0 0 0 10px rgba(34, 197, 94, 0)",
                  "0 0 0 0 rgba(34, 197, 94, 0)",
                ],
              }}
              transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
            >
              <Phone className="h-6 w-6" />
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
