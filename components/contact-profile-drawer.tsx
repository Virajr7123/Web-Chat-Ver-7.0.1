"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/components/ui/use-toast"
import { User, Mail, Phone, Video, MessageSquare, Edit3, Trash2, Clock, CheckCircle, X, Save } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useChat } from "@/contexts/chat-context"
import { useTheme } from "@/contexts/theme-context"
import { ref, update, set } from "firebase/database"
import { database } from "@/lib/firebase"
import { formatDistanceToNow } from "date-fns"

interface Contact {
  id: string
  uid: string
  name: string
  email: string
  avatar?: string
  lastMessage?: string
  timestamp?: number
  unread?: number
  isOnline?: boolean
  lastSeen?: number
}

interface ContactProfileDrawerProps {
  isOpen: boolean
  onClose: () => void
  contact: Contact | null
}

export default function ContactProfileDrawer({ isOpen, onClose, contact }: ContactProfileDrawerProps) {
  const { currentUser } = useAuth()
  const { currentTheme } = useTheme()
  const { updateContactName } = useChat()
  const { toast } = useToast()
  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  if (!contact) return null

  const handleStartEdit = () => {
    setEditedName(contact.name)
    setIsEditing(true)
  }

  const handleSaveEdit = async () => {
    if (!currentUser || !editedName.trim()) return

    setIsLoading(true)
    try {
      await updateContactName(contact.uid, editedName.trim())

      toast({
        title: "Contact renamed",
        description: `Contact has been renamed to ${editedName.trim()}`,
      })

      setIsEditing(false)
    } catch (error) {
      console.error("Error renaming contact:", error)
      toast({
        title: "Error",
        description: "Failed to rename contact. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditedName("")
  }

  const handleClearMessages = async () => {
    if (!currentUser || !contact) return

    setIsLoading(true)
    try {
      // Get the correct chat ID format used by your app
      const getChatId = (uid1: string, uid2: string): string => {
        return uid1 > uid2 ? `${uid1}-${uid2}` : `${uid2}-${uid1}`
      }

      const chatId = getChatId(currentUser.uid, contact.uid)

      // Clear messages from the messages collection
      const messagesRef = ref(database, `messages/${chatId}`)
      await set(messagesRef, null)

      // Update contact's last message info for current user
      const contactRef = ref(database, `contacts/${currentUser.uid}/${contact.uid}`)
      await update(contactRef, {
        lastMessage: "",
        timestamp: 0,
        unread: 0,
      })

      // Also update for the other user to keep consistency
      const otherContactRef = ref(database, `contacts/${contact.uid}/${currentUser.uid}`)
      await update(otherContactRef, {
        lastMessage: "",
        timestamp: 0,
      })

      toast({
        title: "Messages cleared",
        description: "All messages with this contact have been cleared",
      })

      onClose()
    } catch (error) {
      console.error("Error clearing messages:", error)
      toast({
        title: "Error",
        description: "Failed to clear messages. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleStartCall = (type: "voice" | "video") => {
    if (!contact) return

    // Create call object similar to the main chat interface
    const callData = {
      contact: contact,
      type: type,
      isIncoming: false,
    }

    // You'll need to access the calling functions from the parent component
    // For now, we'll trigger the calling interface through a custom event
    const callEvent = new CustomEvent("startCall", {
      detail: callData,
    })

    window.dispatchEvent(callEvent)

    toast({
      title: `${type === "voice" ? "Voice" : "Video"} call`,
      description: `Starting ${type} call with ${contact.name}...`,
    })

    onClose()
  }

  const getDrawerStyles = () => {
    return {
      backgroundColor: currentTheme.colors.card ? `hsl(${currentTheme.colors.card})` : "hsl(var(--card))",
      borderColor: currentTheme.colors.border ? `hsl(${currentTheme.colors.border})` : "hsl(var(--border))",
      color: currentTheme.colors.cardForeground
        ? `hsl(${currentTheme.colors.cardForeground})`
        : "hsl(var(--card-foreground))",
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:w-[400px] p-0 overflow-hidden" style={getDrawerStyles()}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <SheetHeader className="flex-shrink-0 p-6 border-b border-border">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg font-semibold">Contact Info</SheetTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </SheetHeader>

          {/* Scrollable Content */}
          <ScrollArea className="flex-1 overflow-hidden">
            <div className="p-6 space-y-6">
              {/* Profile Section */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center text-center space-y-4"
              >
                <div className="relative">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={contact.avatar || "/placeholder.svg?height=96&width=96"} />
                    <AvatarFallback className="bg-muted text-2xl">
                      {contact.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {contact.isOnline && (
                    <div className="absolute bottom-2 right-2 h-6 w-6 rounded-full border-4 border-card bg-green-500"></div>
                  )}
                </div>

                {/* Name Section with Edit */}
                <div className="space-y-2 w-full">
                  {isEditing ? (
                    <div className="flex items-center space-x-2">
                      <Input
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        className="text-center"
                        placeholder="Enter contact name"
                        disabled={isLoading}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleSaveEdit}
                        disabled={isLoading || !editedName.trim()}
                        className="text-green-600 hover:text-green-700"
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleCancelEdit}
                        disabled={isLoading}
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center space-x-2">
                      <h2 className="text-xl font-semibold">{contact.name}</h2>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleStartEdit}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {contact.isOnline ? (
                      <span className="flex items-center justify-center space-x-1">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        <span>Online</span>
                      </span>
                    ) : contact.lastSeen ? (
                      <span className="flex items-center justify-center space-x-1">
                        <Clock className="h-3 w-3" />
                        <span>Last seen {formatDistanceToNow(new Date(contact.lastSeen), { addSuffix: true })}</span>
                      </span>
                    ) : (
                      "Offline"
                    )}
                  </p>
                </div>
              </motion.div>

              {/* Quick Actions */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="grid grid-cols-3 gap-4"
              >
                <Button
                  variant="outline"
                  className="flex flex-col items-center space-y-2 h-auto py-4"
                  onClick={() => handleStartCall("voice")}
                >
                  <Phone className="h-5 w-5" />
                  <span className="text-xs">Call</span>
                </Button>
                <Button
                  variant="outline"
                  className="flex flex-col items-center space-y-2 h-auto py-4"
                  onClick={() => handleStartCall("video")}
                >
                  <Video className="h-5 w-5" />
                  <span className="text-xs">Video</span>
                </Button>
                <Button
                  variant="outline"
                  className="flex flex-col items-center space-y-2 h-auto py-4"
                  onClick={onClose}
                >
                  <MessageSquare className="h-5 w-5" />
                  <span className="text-xs">Message</span>
                </Button>
              </motion.div>

              <Separator />

              {/* Contact Details */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="space-y-4"
              >
                <h3 className="font-medium text-foreground">Contact Details</h3>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-blue-500/20 text-blue-600 dark:text-blue-400">
                      <Mail className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Email</p>
                      <p className="text-sm text-muted-foreground truncate">{contact.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-green-500/20 text-green-600 dark:text-green-400">
                      <User className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Display Name</p>
                      <p className="text-sm text-muted-foreground truncate">{contact.name}</p>
                    </div>
                  </div>
                </div>
              </motion.div>

              <Separator />

              {/* Chat Statistics */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-4"
              >
                <h3 className="font-medium text-foreground">Chat Info</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Last Message</span>
                    <span className="text-sm font-medium">
                      {contact.timestamp
                        ? formatDistanceToNow(new Date(contact.timestamp), { addSuffix: true })
                        : "Never"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Unread Messages</span>
                    <Badge variant={contact.unread && contact.unread > 0 ? "destructive" : "secondary"}>
                      {contact.unread || 0}
                    </Badge>
                  </div>
                </div>
              </motion.div>

              <Separator />

              {/* Actions */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="space-y-3"
              >
                <h3 className="font-medium text-foreground">Actions</h3>

                {/* Clear Messages Button */}
                <Button
                  variant="outline"
                  className="w-full justify-start text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950"
                  onClick={handleClearMessages}
                  disabled={isLoading}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear Messages
                </Button>
              </motion.div>
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  )
}
