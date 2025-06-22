"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { ref, push, onValue, set, remove, get } from "firebase/database"
import { database } from "@/lib/firebase"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/components/ui/use-toast"

interface UseWebRTCProps {
  contactId: string
  callType: "voice" | "video"
  isIncoming?: boolean
}

type CallStatus = "idle" | "calling" | "ringing" | "connecting" | "connected" | "ended" | "rejected"

export const useWebRTC = ({ contactId, callType, isIncoming = false }: UseWebRTCProps) => {
  const { currentUser } = useAuth()
  const { toast } = useToast()

  // WebRTC states
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [callStatus, setCallStatus] = useState<CallStatus>("idle")

  // Control states
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(callType === "video")
  const [isSpeakerOn, setIsSpeakerOn] = useState(false)

  // Refs
  const callIdRef = useRef<string | null>(null)
  const iceCandidatesRef = useRef<RTCIceCandidate[]>([])

  // WebRTC Configuration with STUN servers for better connectivity
  const rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
    ],
    iceCandidatePoolSize: 10,
  }

  // Initialize media stream
  const initializeMedia = useCallback(async () => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 2,
        },
        video:
          callType === "video"
            ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
                facingMode: "user",
              }
            : false,
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      setLocalStream(stream)
      return stream
    } catch (error) {
      console.error("Error accessing media devices:", error)
      toast({
        title: "Media Access Error",
        description: "Could not access camera/microphone. Please check permissions.",
        variant: "destructive",
      })
      throw error
    }
  }, [callType, toast])

  // Create peer connection
  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(rtcConfig)

    pc.onicecandidate = (event) => {
      if (event.candidate && callIdRef.current) {
        const candidateRef = ref(database, `calls/${callIdRef.current}/candidates/${currentUser?.uid}`)
        push(candidateRef, event.candidate.toJSON())
      }
    }

    pc.ontrack = (event) => {
      console.log("Received remote stream")
      setRemoteStream(event.streams[0])
    }

    pc.onconnectionstatechange = () => {
      console.log("Connection state:", pc.connectionState)
      if (pc.connectionState === "connected") {
        setIsConnected(true)
        setCallStatus("connected")
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        setIsConnected(false)
        setCallStatus("ended")
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log("ICE connection state:", pc.iceConnectionState)
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        setIsConnected(true)
        setCallStatus("connected")
      }
    }

    setPeerConnection(pc)
    return pc
  }, [currentUser?.uid])

  // Start outgoing call
  const startCall = useCallback(async () => {
    if (!currentUser) return

    try {
      setCallStatus("calling")
      const stream = await initializeMedia()
      const pc = createPeerConnection()

      // Add local stream to peer connection
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream)
      })

      // Create call document in Firebase
      const callRef = push(ref(database, "calls"))
      callIdRef.current = callRef.key

      console.log("Creating call with ID:", callRef.key)

      const callData = {
        callerId: currentUser.uid,
        calleeId: contactId,
        type: callType,
        status: "calling",
        createdAt: Date.now(),
      }

      console.log("Call data:", callData)

      try {
        await set(callRef, callData)
        console.log("Call document created successfully")

        // Small delay to ensure Firebase write completes
        await new Promise((resolve) => setTimeout(resolve, 500))
      } catch (error) {
        console.error("Error creating call document:", error)
        throw error
      }

      // Create offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // Save offer to Firebase
      await set(ref(database, `calls/${callRef.key}/offer`), {
        type: offer.type,
        sdp: offer.sdp,
      })

      // Listen for answer
      const answerRef = ref(database, `calls/${callRef.key}/answer`)
      onValue(answerRef, async (snapshot) => {
        if (snapshot.exists() && pc.currentRemoteDescription === null) {
          const answer = snapshot.val()
          await pc.setRemoteDescription(new RTCSessionDescription(answer))
          setCallStatus("connecting")
        }
      })

      // Listen for ICE candidates
      const candidatesRef = ref(database, `calls/${callRef.key}/candidates/${contactId}`)
      onValue(candidatesRef, (snapshot) => {
        if (snapshot.exists()) {
          Object.values(snapshot.val()).forEach(async (candidateData: any) => {
            if (candidateData && pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(candidateData))
            }
          })
        }
      })

      // Listen for call status changes
      const statusRef = ref(database, `calls/${callRef.key}/status`)
      onValue(statusRef, (snapshot) => {
        if (snapshot.exists()) {
          const status = snapshot.val()
          setCallStatus(status)
          if (status === "rejected" || status === "ended") {
            endCall()
          }
        }
      })
    } catch (error) {
      console.error("Error starting call:", error)
      setCallStatus("ended")
    }
  }, [currentUser, contactId, callType, initializeMedia, createPeerConnection])

  // Accept incoming call
  const acceptCall = useCallback(async () => {
    if (!currentUser || !callIdRef.current) {
      console.log("Cannot accept call - missing user or call ID")
      return
    }

    console.log("Accepting call:", callIdRef.current)

    try {
      setCallStatus("connecting")
      const stream = await initializeMedia()
      const pc = createPeerConnection()

      // Add local stream to peer connection
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream)
      })

      // Get offer from Firebase
      const offerRef = ref(database, `calls/${callIdRef.current}/offer`)
      const offerSnapshot = await get(offerRef)

      if (offerSnapshot.exists()) {
        const offer = offerSnapshot.val()
        console.log("Got offer:", offer)
        await pc.setRemoteDescription(new RTCSessionDescription(offer))

        // Create answer
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        // Save answer to Firebase
        await set(ref(database, `calls/${callIdRef.current}/answer`), {
          type: answer.type,
          sdp: answer.sdp,
        })

        // Update call status
        await set(ref(database, `calls/${callIdRef.current}/status`), "accepted")
        console.log("Call accepted successfully")

        // Listen for ICE candidates
        const candidatesRef = ref(database, `calls/${callIdRef.current}/candidates/${contactId}`)
        onValue(candidatesRef, (snapshot) => {
          if (snapshot.exists()) {
            Object.values(snapshot.val()).forEach(async (candidateData: any) => {
              if (candidateData && pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(candidateData))
              }
            })
          }
        })
      } else {
        console.error("No offer found for call")
      }
    } catch (error) {
      console.error("Error accepting call:", error)
      setCallStatus("ended")
    }
  }, [currentUser, contactId, initializeMedia, createPeerConnection])

  // Reject call
  const rejectCall = useCallback(async () => {
    if (!callIdRef.current) return

    try {
      await set(ref(database, `calls/${callIdRef.current}/status`), "rejected")
      setCallStatus("rejected")
      cleanup()
    } catch (error) {
      console.error("Error rejecting call:", error)
    }
  }, [])

  // End call
  const endCall = useCallback(async () => {
    if (callIdRef.current) {
      try {
        await set(ref(database, `calls/${callIdRef.current}/status`), "ended")
      } catch (error) {
        console.error("Error ending call:", error)
      }
    }
    setCallStatus("ended")
    cleanup()
  }, [])

  // Cleanup function
  const cleanup = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop())
      setLocalStream(null)
    }

    if (peerConnection) {
      peerConnection.close()
      setPeerConnection(null)
    }

    if (callIdRef.current) {
      // Clean up Firebase call data
      remove(ref(database, `calls/${callIdRef.current}`))
      callIdRef.current = null
    }

    setRemoteStream(null)
    setIsConnected(false)
  }, [localStream, peerConnection])

  // Control functions
  const toggleMute = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setIsMuted(!audioTrack.enabled)
      }
    }
  }, [localStream])

  const toggleVideo = useCallback(() => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setIsVideoEnabled(videoTrack.enabled)
      }
    }
  }, [localStream])

  const toggleSpeaker = useCallback(() => {
    setIsSpeakerOn(!isSpeakerOn)
    // Note: Speaker control is limited in web browsers
    // This is more of a UI state for mobile apps
  }, [isSpeakerOn])

  // Initialize for incoming calls
  useEffect(() => {
    if (isIncoming && contactId) {
      // Set up listener for incoming call
      const callsRef = ref(database, "calls")
      const unsubscribe = onValue(callsRef, (snapshot) => {
        if (snapshot.exists()) {
          const calls = snapshot.val()
          Object.entries(calls).forEach(([callId, callData]: [string, any]) => {
            if (
              callData.calleeId === currentUser?.uid &&
              callData.callerId === contactId &&
              callData.status === "calling"
            ) {
              callIdRef.current = callId
              setCallStatus("ringing")
            }
          })
        }
      })

      return () => unsubscribe()
    }
  }, [isIncoming, contactId, currentUser?.uid])

  // Auto-start call for outgoing calls
  useEffect(() => {
    if (!isIncoming && contactId && callStatus === "idle") {
      startCall()
    }
  }, [isIncoming, contactId, callStatus, startCall])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  return {
    localStream,
    remoteStream,
    isConnected,
    callStatus,
    isMuted,
    isVideoEnabled,
    isSpeakerOn,
    toggleMute,
    toggleVideo,
    toggleSpeaker,
    acceptCall,
    rejectCall,
    endCall,
    startCall,
  }
}
