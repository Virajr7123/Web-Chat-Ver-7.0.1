"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Phone, Video, Users } from "lucide-react"
import CallingInterface from "./calling-interface"
import IncomingCallNotification from "./incoming-call-notification"

export default function CallingTest() {
  const [showVoiceCall, setShowVoiceCall] = useState(false)
  const [showVideoCall, setShowVideoCall] = useState(false)
  const [showIncomingCall, setShowIncomingCall] = useState(false)

  const testContact = {
    id: "test-contact",
    name: "Test User",
    avatar: "/placeholder.svg?height=40&width=40",
  }

  const handleIncomingCall = (call: any) => {
    console.log("Incoming call accepted:", call)
    setShowIncomingCall(false)
    setShowVoiceCall(true)
  }

  const handleRejectCall = (callId: string) => {
    console.log("Call rejected:", callId)
    setShowIncomingCall(false)
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            WebRTC Calling Test
          </CardTitle>
          <CardDescription>Test the voice and video calling functionality</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button onClick={() => setShowVoiceCall(true)} className="flex items-center gap-2" variant="outline">
              <Phone className="h-4 w-4" />
              Test Voice Call
            </Button>

            <Button onClick={() => setShowVideoCall(true)} className="flex items-center gap-2" variant="outline">
              <Video className="h-4 w-4" />
              Test Video Call
            </Button>

            <Button onClick={() => setShowIncomingCall(true)} className="flex items-center gap-2" variant="outline">
              <Users className="h-4 w-4" />
              Test Incoming Call
            </Button>
          </div>

          <div className="text-sm text-muted-foreground">
            <p>
              <strong>Instructions:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>Click "Test Voice Call" to simulate an outgoing voice call</li>
              <li>Click "Test Video Call" to simulate an outgoing video call</li>
              <li>Click "Test Incoming Call" to simulate receiving a call</li>
              <li>Grant camera/microphone permissions when prompted</li>
              <li>Test all controls: mute, video toggle, speaker, end call</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Voice Call Interface */}
      {showVoiceCall && (
        <CallingInterface
          isOpen={showVoiceCall}
          onClose={() => setShowVoiceCall(false)}
          contact={testContact}
          callType="voice"
          isIncoming={false}
        />
      )}

      {/* Video Call Interface */}
      {showVideoCall && (
        <CallingInterface
          isOpen={showVideoCall}
          onClose={() => setShowVideoCall(false)}
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
