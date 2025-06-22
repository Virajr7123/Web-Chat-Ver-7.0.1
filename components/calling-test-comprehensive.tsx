"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Phone,
  Video,
  Users,
  Mic,
  MicOff,
  Volume2,
  RotateCcw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Camera,
  CameraOff,
} from "lucide-react"
import CallingInterface from "./calling-interface"
import IncomingCallNotification from "./incoming-call-notification"
import { motion, AnimatePresence } from "framer-motion"

interface TestResult {
  name: string
  status: "pending" | "success" | "error" | "warning"
  message: string
  timestamp?: number
}

export default function CallingTestComprehensive() {
  const [showVoiceCall, setShowVoiceCall] = useState(false)
  const [showVideoCall, setShowVideoCall] = useState(false)
  const [showIncomingCall, setShowIncomingCall] = useState(false)
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [isTestingAudio, setIsTestingAudio] = useState(false)
  const [isTestingVideo, setIsTestingVideo] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [hasPermissions, setHasPermissions] = useState({ audio: false, video: false })
  const [deviceInfo, setDeviceInfo] = useState<{
    audioInputs: MediaDeviceInfo[]
    audioOutputs: MediaDeviceInfo[]
    videoInputs: MediaDeviceInfo[]
  }>({ audioInputs: [], audioOutputs: [], videoInputs: [] })
  const [showCallingInterface, setShowCallingInterface] = useState(false)
  const [currentCall, setCurrentCall] = useState<any | null>(null)

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const testAudioRef = useRef<HTMLAudioElement>(null)

  const testContact = {
    id: "test-contact-comprehensive",
    name: "Test User (Comprehensive)",
    avatar: "/placeholder.svg?height=40&width=40",
  }

  // Initialize comprehensive testing
  useEffect(() => {
    initializeTests()
    return () => {
      cleanup()
    }
  }, [])

  const cleanup = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop())
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
    }
  }

  const addTestResult = (name: string, status: TestResult["status"], message: string) => {
    setTestResults((prev) => [
      ...prev,
      {
        name,
        status,
        message,
        timestamp: Date.now(),
      },
    ])
  }

  const initializeTests = async () => {
    addTestResult("System Check", "pending", "Starting comprehensive calling tests...")

    // Check browser compatibility
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      addTestResult("Browser Support", "error", "WebRTC not supported in this browser")
      return
    }
    addTestResult("Browser Support", "success", "WebRTC supported")

    // Check permissions
    await checkPermissions()

    // Get device information
    await getDeviceInfo()

    // Test audio context
    await testAudioContext()
  }

  const checkPermissions = async () => {
    try {
      // Check microphone permission
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        setHasPermissions((prev) => ({ ...prev, audio: true }))
        addTestResult("Microphone Permission", "success", "Microphone access granted")
        audioStream.getTracks().forEach((track) => track.stop())
      } catch (error) {
        setHasPermissions((prev) => ({ ...prev, audio: false }))
        addTestResult("Microphone Permission", "error", `Microphone access denied: ${error.message}`)
      }

      // Check camera permission
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true })
        setHasPermissions((prev) => ({ ...prev, video: true }))
        addTestResult("Camera Permission", "success", "Camera access granted")
        videoStream.getTracks().forEach((track) => track.stop())
      } catch (error) {
        setHasPermissions((prev) => ({ ...prev, video: false }))
        addTestResult("Camera Permission", "error", `Camera access denied: ${error.message}`)
      }
    } catch (error) {
      addTestResult("Permission Check", "error", `Failed to check permissions: ${error.message}`)
    }
  }

  const getDeviceInfo = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices.filter((device) => device.kind === "audioinput")
      const audioOutputs = devices.filter((device) => device.kind === "audiooutput")
      const videoInputs = devices.filter((device) => device.kind === "videoinput")

      setDeviceInfo({ audioInputs, audioOutputs, videoInputs })

      addTestResult(
        "Device Detection",
        "success",
        `Found ${audioInputs.length} microphones, ${audioOutputs.length} speakers, ${videoInputs.length} cameras`,
      )
    } catch (error) {
      addTestResult("Device Detection", "error", `Failed to enumerate devices: ${error.message}`)
    }
  }

  const testAudioContext = async () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      audioContextRef.current = audioContext
      addTestResult("Audio Context", "success", `Audio context created (Sample rate: ${audioContext.sampleRate}Hz)`)
    } catch (error) {
      addTestResult("Audio Context", "error", `Failed to create audio context: ${error.message}`)
    }
  }

  const testMicrophone = async () => {
    if (!hasPermissions.audio) {
      addTestResult("Microphone Test", "error", "Microphone permission required")
      return
    }

    setIsTestingAudio(true)
    addTestResult("Microphone Test", "pending", "Testing microphone input...")

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        },
      })

      micStreamRef.current = stream

      if (audioContextRef.current) {
        const source = audioContextRef.current.createMediaStreamSource(stream)
        const analyser = audioContextRef.current.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)
        analyserRef.current = analyser

        // Monitor audio levels
        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        const checkAudioLevel = () => {
          if (analyser && isTestingAudio) {
            analyser.getByteFrequencyData(dataArray)
            const average = dataArray.reduce((a, b) => a + b) / dataArray.length
            setAudioLevel(average)
            requestAnimationFrame(checkAudioLevel)
          }
        }
        checkAudioLevel()

        addTestResult("Microphone Test", "success", "Microphone working - speak to see audio levels")

        // Auto-stop after 10 seconds
        setTimeout(() => {
          if (isTestingAudio) {
            stopMicrophoneTest()
          }
        }, 10000)
      }
    } catch (error) {
      addTestResult("Microphone Test", "error", `Microphone test failed: ${error.message}`)
      setIsTestingAudio(false)
    }
  }

  const stopMicrophoneTest = () => {
    setIsTestingAudio(false)
    setAudioLevel(0)
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop())
      micStreamRef.current = null
    }
    addTestResult("Microphone Test", "success", "Microphone test completed")
  }

  const testCamera = async () => {
    if (!hasPermissions.video) {
      addTestResult("Camera Test", "error", "Camera permission required")
      return
    }

    setIsTestingVideo(true)
    addTestResult("Camera Test", "pending", "Testing camera...")

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
        addTestResult("Camera Test", "success", "Camera working - you should see video preview")

        // Auto-stop after 10 seconds
        setTimeout(() => {
          if (isTestingVideo) {
            stopCameraTest()
          }
        }, 10000)
      }
    } catch (error) {
      addTestResult("Camera Test", "error", `Camera test failed: ${error.message}`)
      setIsTestingVideo(false)
    }
  }

  const stopCameraTest = () => {
    setIsTestingVideo(false)
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach((track) => track.stop())
      videoRef.current.srcObject = null
    }
    addTestResult("Camera Test", "success", "Camera test completed")
  }

  const testSpeakers = () => {
    addTestResult("Speaker Test", "pending", "Testing speakers...")

    // Create test tone
    if (audioContextRef.current) {
      const oscillator = audioContextRef.current.createOscillator()
      const gainNode = audioContextRef.current.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContextRef.current.destination)

      oscillator.frequency.setValueAtTime(440, audioContextRef.current.currentTime) // A4 note
      gainNode.gain.setValueAtTime(0.1, audioContextRef.current.currentTime)

      oscillator.start()
      oscillator.stop(audioContextRef.current.currentTime + 1)

      addTestResult("Speaker Test", "success", "Test tone played - did you hear it?")
    } else {
      // Fallback to HTML audio
      const audio = new Audio()
      audio.src =
        "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT"
      audio
        .play()
        .then(() => {
          addTestResult("Speaker Test", "success", "Test tone played - did you hear it?")
        })
        .catch((error) => {
          addTestResult("Speaker Test", "error", `Speaker test failed: ${error.message}`)
        })
    }
  }

  const testNetworkConnection = async () => {
    addTestResult("Network Test", "pending", "Testing network connectivity...")

    try {
      // Test STUN server connectivity
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
      })

      const startTime = Date.now()
      let iceGatheringComplete = false

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = event.candidate
          addTestResult(
            "ICE Candidate",
            "success",
            `Found ${candidate.type} candidate: ${candidate.address || "hidden"}:${candidate.port || "unknown"}`,
          )
        } else if (!iceGatheringComplete) {
          iceGatheringComplete = true
          const duration = Date.now() - startTime
          addTestResult("Network Test", "success", `ICE gathering completed in ${duration}ms`)
          pc.close()
        }
      }

      pc.onicegatheringstatechange = () => {
        addTestResult("ICE Gathering", "pending", `State: ${pc.iceGatheringState}`)
      }

      // Create a dummy data channel to trigger ICE gathering
      pc.createDataChannel("test")
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!iceGatheringComplete) {
          addTestResult("Network Test", "warning", "ICE gathering taking longer than expected")
          pc.close()
        }
      }, 10000)
    } catch (error) {
      addTestResult("Network Test", "error", `Network test failed: ${error.message}`)
    }
  }

  const handleIncomingCall = (call: any) => {
    addTestResult("Incoming Call", "success", "Incoming call accepted successfully")
    setShowIncomingCall(false)
    setShowCallingInterface(true)
    setCurrentCall(call)
  }

  const handleRejectCall = (callId: string) => {
    addTestResult("Incoming Call", "success", "Incoming call rejected successfully")
    setShowIncomingCall(false)
  }

  const handleCallEnd = () => {
    addTestResult("Call Management", "success", "Call ended successfully")
    setShowCallingInterface(false)
    setCurrentCall(null)
  }

  const clearResults = () => {
    setTestResults([])
  }

  const getStatusIcon = (status: TestResult["status"]) => {
    switch (status) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />
      case "warning":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />
      case "pending":
        return (
          <motion.div
            className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
          />
        )
    }
  }

  const getStatusColor = (status: TestResult["status"]) => {
    switch (status) {
      case "success":
        return "bg-green-100 text-green-800 border-green-200"
      case "error":
        return "bg-red-100 text-red-800 border-red-200"
      case "warning":
        return "bg-yellow-100 text-yellow-800 border-yellow-200"
      case "pending":
        return "bg-blue-100 text-blue-800 border-blue-200"
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-6 w-6" />
            Comprehensive WebRTC Calling Test Suite
          </CardTitle>
          <CardDescription>
            Complete testing of voice/video calling features, audio quality, and network connectivity
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Tests */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">System & Hardware Tests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Permissions Status */}
            <div className="space-y-2">
              <h4 className="font-medium">Permissions Status</h4>
              <div className="flex gap-2">
                <Badge variant={hasPermissions.audio ? "default" : "destructive"}>
                  <Mic className="h-3 w-3 mr-1" />
                  Microphone {hasPermissions.audio ? "✓" : "✗"}
                </Badge>
                <Badge variant={hasPermissions.video ? "default" : "destructive"}>
                  <Camera className="h-3 w-3 mr-1" />
                  Camera {hasPermissions.video ? "✓" : "✗"}
                </Badge>
              </div>
            </div>

            <Separator />

            {/* Device Information */}
            <div className="space-y-2">
              <h4 className="font-medium">Available Devices</h4>
              <div className="text-sm space-y-1">
                <p>🎤 Microphones: {deviceInfo.audioInputs.length}</p>
                <p>🔊 Speakers: {deviceInfo.audioOutputs.length}</p>
                <p>📹 Cameras: {deviceInfo.videoInputs.length}</p>
              </div>
            </div>

            <Separator />

            {/* Hardware Tests */}
            <div className="space-y-3">
              <h4 className="font-medium">Hardware Tests</h4>

              {/* Microphone Test */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Microphone Test</span>
                  <Button
                    size="sm"
                    variant={isTestingAudio ? "destructive" : "outline"}
                    onClick={isTestingAudio ? stopMicrophoneTest : testMicrophone}
                    disabled={!hasPermissions.audio}
                  >
                    {isTestingAudio ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    {isTestingAudio ? "Stop" : "Test Mic"}
                  </Button>
                </div>
                {isTestingAudio && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs">Audio Level:</span>
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <motion.div
                          className="bg-green-500 h-2 rounded-full"
                          style={{ width: `${Math.min(audioLevel * 2, 100)}%` }}
                          animate={{ width: `${Math.min(audioLevel * 2, 100)}%` }}
                          transition={{ duration: 0.1 }}
                        />
                      </div>
                      <span className="text-xs w-8">{Math.round(audioLevel)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Speak into your microphone to test</p>
                  </div>
                )}
              </div>

              {/* Camera Test */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Camera Test</span>
                  <Button
                    size="sm"
                    variant={isTestingVideo ? "destructive" : "outline"}
                    onClick={isTestingVideo ? stopCameraTest : testCamera}
                    disabled={!hasPermissions.video}
                  >
                    {isTestingVideo ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                    {isTestingVideo ? "Stop" : "Test Camera"}
                  </Button>
                </div>
                {isTestingVideo && (
                  <div className="space-y-2">
                    <video
                      ref={videoRef}
                      className="w-full h-32 bg-black rounded border object-cover"
                      muted
                      playsInline
                    />
                    <p className="text-xs text-muted-foreground">You should see yourself in the video preview</p>
                  </div>
                )}
              </div>

              {/* Speaker Test */}
              <div className="flex items-center justify-between">
                <span className="text-sm">Speaker Test</span>
                <Button size="sm" variant="outline" onClick={testSpeakers}>
                  <Volume2 className="h-4 w-4" />
                  Test Speakers
                </Button>
              </div>

              {/* Network Test */}
              <div className="flex items-center justify-between">
                <span className="text-sm">Network Connectivity</span>
                <Button size="sm" variant="outline" onClick={testNetworkConnection}>
                  <Users className="h-4 w-4" />
                  Test Network
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Call Tests */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Call Feature Tests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <Button onClick={() => setShowVoiceCall(true)} className="flex items-center gap-2 h-12" variant="outline">
                <Phone className="h-5 w-5" />
                Test Voice Call
                <Badge variant="secondary" className="ml-auto">
                  Audio Only
                </Badge>
              </Button>

              <Button onClick={() => setShowVideoCall(true)} className="flex items-center gap-2 h-12" variant="outline">
                <Video className="h-5 w-5" />
                Test Video Call
                <Badge variant="secondary" className="ml-auto">
                  Audio + Video
                </Badge>
              </Button>

              <Button
                onClick={() => setShowIncomingCall(true)}
                className="flex items-center gap-2 h-12"
                variant="outline"
              >
                <Users className="h-5 w-5" />
                Test Incoming Call
                <Badge variant="secondary" className="ml-auto">
                  Notification
                </Badge>
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="font-medium text-sm">Test Checklist</h4>
              <div className="text-xs space-y-1 text-muted-foreground">
                <p>✓ Accept/Reject incoming calls</p>
                <p>✓ Mute/Unmute microphone</p>
                <p>✓ Enable/Disable video</p>
                <p>✓ Speaker on/off toggle</p>
                <p>✓ End call functionality</p>
                <p>✓ Fullscreen mode (video)</p>
                <p>✓ Call status indicators</p>
                <p>✓ Audio quality and clarity</p>
                <p>✓ Video quality and smoothness</p>
                <p>✓ Connection stability</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Test Results */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Test Results</CardTitle>
            <CardDescription>Real-time test results and system diagnostics</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={clearResults}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Clear Results
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            <AnimatePresence>
              {testResults.map((result, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className={`p-3 rounded-lg border ${getStatusColor(result.status)}`}
                >
                  <div className="flex items-start gap-2">
                    {getStatusIcon(result.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">{result.name}</h4>
                        {result.timestamp && (
                          <span className="text-xs opacity-60">{new Date(result.timestamp).toLocaleTimeString()}</span>
                        )}
                      </div>
                      <p className="text-sm mt-1">{result.message}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {testResults.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No test results yet. Run some tests to see results here.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Testing Instructions:</strong>
          <br />
          1. First run hardware tests to ensure your devices work properly
          <br />
          2. Test network connectivity to check WebRTC connection
          <br />
          3. Try voice and video calls to test all features
          <br />
          4. During calls, test all controls: mute, video toggle, speaker, end call
          <br />
          5. Check audio quality, video smoothness, and connection stability
          <br />
          6. Test incoming call notifications and accept/reject functionality
        </AlertDescription>
      </Alert>

      {/* Voice Call Interface */}
      {showVoiceCall && (
        <CallingInterface
          isOpen={showVoiceCall}
          onClose={() => {
            setShowVoiceCall(false)
            addTestResult("Voice Call", "success", "Voice call test completed")
          }}
          contact={testContact}
          callType="voice"
          isIncoming={false}
        />
      )}

      {/* Video Call Interface */}
      {showVideoCall && (
        <CallingInterface
          isOpen={showVideoCall}
          onClose={() => {
            setShowVideoCall(false)
            addTestResult("Video Call", "success", "Video call test completed")
          }}
          contact={testContact}
          callType="video"
          isIncoming={false}
        />
      )}

      {/* Incoming Call Notification */}
      {showIncomingCall && <IncomingCallNotification onAccept={handleIncomingCall} onReject={handleRejectCall} />}
    </div>
  )
}
