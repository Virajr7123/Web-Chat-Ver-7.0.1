"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import {
  Search,
  Plus,
  Send,
  MoreVertical,
  Phone,
  Video,
  ArrowLeft,
  Settings,
  LogOut,
  User,
  X,
  ReplyIcon,
  Users,
  Crown,
  Archive,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useChat } from "@/contexts/chat-context"
import { useTheme } from "@/contexts/theme-context"
import { ref, set, get, onValue, query, orderByChild, equalTo, push, update } from "firebase/database"
import { database } from "@/lib/firebase"
import { formatDistanceToNow } from "date-fns"
import ContactProfileDrawer from "./contact-profile-drawer"
import UserProfileDrawer from "./user-profile-drawer"
import FileUpload from "./file-upload"
import MessageFilePreview from "./message-file-preview"
import DragDropZone from "./drag-drop-zone"
import MessageContextMenu from "./message-context-menu"
import MessageReactions from "./message-reactions"
import TypingIndicator from "./typing-indicator"
import UnreadBadge from "./unread-badge"
import GroupCreationModal from "./group-creation-modal"
import GroupProfileDrawer from "./group-profile-drawer"
import ChatContextMenu from "./chat-context-menu"
import CallingInterface from "./calling-interface"
import IncomingCallNotification from "./incoming-call-notification"

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

interface Group {
  id: string
  name: string
  description?: string
  avatar?: string
  createdBy: string
  createdAt: number
  members: { [uid: string]: { name: string; role: "admin" | "member"; joinedAt: number } }
  lastMessage?: string
  timestamp?: number
  unread?: number
}

interface Message {
  id: string
  text: string
  senderUid: string
  receiverUid?: string
  groupId?: string
  timestamp: number
  status: string
  sender: "user" | "contact"
  senderName?: string
  isTemp?: boolean
  fileUrl?: string
  fileType?: string
  fileName?: string
  replyToId?: string
  replyToText?: string
  reactions?: { [emoji: string]: { users: string[]; userNames: { [uid: string]: string } } }
  isDeleted?: boolean
}

export default function ChatInterface() {
  const { currentUser, userProfile, logout } = useAuth()
  const { currentTheme } = useTheme()
  const {
    selectedContact,
    setSelectedContact,
    messages,
    setMessages,
    sendMessage,
    addReaction,
    deleteMessage,
    contacts,
    setContacts,
    typingUsers,
    startTyping,
    stopTyping,
    loadMoreMessages,
    hasMoreMessages,
  } = useChat()
  const [newMessage, setNewMessage] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [showAddContact, setShowAddContact] = useState(false)
  const [newContactEmail, setNewContactEmail] = useState("")
  const [isMobile, setIsMobile] = useState(false)
  const [showContactProfile, setShowContactProfile] = useState(false)
  const [showUserProfile, setShowUserProfile] = useState(false)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [activeTab, setActiveTab] = useState<"chats" | "groups">("chats")
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [showGroupCreation, setShowGroupCreation] = useState(false)
  const [showGroupProfile, setShowGroupProfile] = useState(false)
  const [groupMessages, setGroupMessages] = useState<{ [groupId: string]: Message[] }>({})
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean
    x: number
    y: number
    message: Message | null
  }>({
    visible: false,
    x: 0,
    y: 0,
    message: null,
  })

  // Calling states
  const [showCallingInterface, setShowCallingInterface] = useState(false)
  const [currentCall, setCurrentCall] = useState<{
    contact: Contact | null
    type: "voice" | "video"
    isIncoming: boolean
  } | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messageInputRef = useRef<HTMLTextAreaElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout>()
  const { toast } = useToast()

  // Ref to track if URL is being updated programmatically
  const isUrlUpdatingRef = useRef(false)
  // Ref to store current contact ID to avoid unnecessary URL updates
  const currentContactIdRef = useRef<string | null>(null)

  // Enhanced mobile keyboard handling states
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [initialViewportHeight, setInitialViewportHeight] = useState(0)

  const [swipeState, setSwipeState] = useState<{
    messageId: string | null
    startX: number
    currentX: number
    isActive: boolean
  }>({
    messageId: null,
    startX: 0,
    currentX: 0,
    isActive: false,
  })
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const inputContainerRef = useRef<HTMLDivElement>(null)

  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [emojiPickerPosition, setEmojiPickerPosition] = useState({ x: 0, y: 0 })

  // Close the emoji picker when the user clicks anywhere else
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!showEmojiPicker) return
      const target = event.target as HTMLElement
      if (!target.closest(".emoji-picker") && !target.closest("[data-emoji-trigger]")) {
        setShowEmojiPicker(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showEmojiPicker])

  // Archive and Pin states
  const [chatContextMenu, setChatContextMenu] = useState<{
    visible: boolean
    x: number
    y: number
    contact: Contact | null
    group: Group | null
  }>({
    visible: false,
    x: 0,
    y: 0,
    contact: null,
    group: null,
  })
  const [pinnedChats, setPinnedChats] = useState<Set<string>>(new Set())
  const [archivedChats, setArchivedChats] = useState<Set<string>>(new Set())
  const [showArchivedChats, setShowArchivedChats] = useState(false)

  // Load more messages state
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Calculate total unread counts for tabs (excluding archived)
  const totalUnreadChats = contacts
    .filter((contact) => !archivedChats.has(contact.id))
    .reduce((total, contact) => total + (contact.unread || 0), 0)
  const totalUnreadGroups = groups
    .filter((group) => !archivedChats.has(group.id))
    .reduce((total, group) => total + (group.unread || 0), 0)

  // Calculate archived unread counts
  const archivedUnreadChats = contacts
    .filter((contact) => archivedChats.has(contact.id))
    .reduce((total, contact) => total + (contact.unread || 0), 0)
  const archivedUnreadGroups = groups
    .filter((group) => archivedChats.has(group.id))
    .reduce((total, group) => total + (group.unread || 0), 0)
  const totalArchivedUnread = archivedUnreadChats + archivedUnreadGroups

  // Auto-focus message input when chat is selected
  useEffect(() => {
    if ((selectedContact || selectedGroup) && messageInputRef.current) {
      // Small delay to ensure the input is rendered
      setTimeout(() => {
        messageInputRef.current?.focus()
      }, 100)
    }
  }, [selectedContact, selectedGroup])

  // Enhanced back navigation with ESC key support
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && (selectedContact || selectedGroup)) {
        setSelectedContact(null)
        setSelectedGroup(null)
        // Update URL to remove chat parameter
        const newUrl = window.location.pathname
        window.history.pushState({}, "", newUrl)
        document.title = "Chit Chat"
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedContact, selectedGroup, setSelectedContact])

  // Browser navigation management
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const urlParams = new URLSearchParams(window.location.search)
      const chatId = urlParams.get("chat")
      const groupId = urlParams.get("group")

      if (chatId && contacts.length > 0) {
        const contact = contacts.find((c) => c.id === chatId)
        if (contact && currentContactIdRef.current !== chatId) {
          setSelectedContact(contact)
          setSelectedGroup(null)
          currentContactIdRef.current = chatId
        }
      } else if (groupId && groups.length > 0) {
        const group = groups.find((g) => g.id === groupId)
        if (group) {
          setSelectedGroup(group)
          setSelectedContact(null)
          currentContactIdRef.current = groupId
        }
      } else if (currentContactIdRef.current !== null) {
        setSelectedContact(null)
        setSelectedGroup(null)
        currentContactIdRef.current = null
      }
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [contacts, groups, setSelectedContact])

  // Update URL and page title when contact changes, but avoid infinite loops
  useEffect(() => {
    // Skip if we're already updating the URL or if the contact hasn't actually changed
    if (isUrlUpdatingRef.current) return

    if (selectedContact) {
      if (currentContactIdRef.current !== selectedContact.id) {
        isUrlUpdatingRef.current = true
        currentContactIdRef.current = selectedContact.id

        const newUrl = `${window.location.pathname}?chat=${selectedContact.id}`
        window.history.pushState({ chatId: selectedContact.id }, "", newUrl)
        document.title = `Chat with ${selectedContact.name} - Chit Chat`

        // Reset the flag after a short delay to allow for any state updates to complete
        setTimeout(() => {
          isUrlUpdatingRef.current = false
        }, 0)
      }
    } else if (selectedGroup) {
      if (currentContactIdRef.current !== selectedGroup.id) {
        isUrlUpdatingRef.current = true
        currentContactIdRef.current = selectedGroup.id

        const newUrl = `${window.location.pathname}?group=${selectedGroup.id}`
        window.history.pushState({ groupId: selectedGroup.id }, "", newUrl)
        document.title = `${selectedGroup.name} - Chit Chat`

        setTimeout(() => {
          isUrlUpdatingRef.current = false
        }, 0)
      }
    } else if (currentContactIdRef.current !== null) {
      isUrlUpdatingRef.current = true
      currentContactIdRef.current = null

      const newUrl = window.location.pathname
      if (window.location.search) {
        window.history.pushState({}, "", newUrl)
      }
      document.title = "Chit Chat"

      setTimeout(() => {
        isUrlUpdatingRef.current = false
      }, 0)
    }
  }, [selectedContact, selectedGroup])

  // Enhanced back navigation
  const handleBackNavigation = useCallback(() => {
    if (selectedContact || selectedGroup) {
      setSelectedContact(null)
      setSelectedGroup(null)
      // Update URL to remove parameters
      const newUrl = window.location.pathname
      window.history.pushState({}, "", newUrl)
      document.title = "Chit Chat"
    }
  }, [selectedContact, selectedGroup, setSelectedContact])

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  // PERFECT Mobile Keyboard Handling - Ultra Smooth & Fixed
  useEffect(() => {
    if (!isMobile) return

    // Initialize viewport heights
    const initHeight = window.innerHeight
    setInitialViewportHeight(initHeight)
    setViewportHeight(initHeight)

    let keyboardTimeout: NodeJS.Timeout
    let resizeTimeout: NodeJS.Timeout
    let isAdjusting = false

    const handleViewportChange = () => {
      if (isAdjusting) return

      const viewport = window.visualViewport
      if (!viewport) return

      const currentHeight = viewport.height
      const heightDiff = initialViewportHeight - currentHeight
      const isKeyboardOpen = heightDiff > 150

      // Update states
      setViewportHeight(currentHeight)
      setKeyboardHeight(heightDiff)
      setIsKeyboardVisible(isKeyboardOpen)

      // Clear existing timeout
      if (keyboardTimeout) clearTimeout(keyboardTimeout)

      // Debounced smooth adjustment
      keyboardTimeout = setTimeout(() => {
        if (isAdjusting) return
        isAdjusting = true

        requestAnimationFrame(() => {
          const chatContainer = chatContainerRef.current
          const inputContainer = inputContainerRef.current
          const chatHeader = document.querySelector("[data-chat-header]") as HTMLElement

          if (!chatContainer || !inputContainer) {
            isAdjusting = false
            return
          }

          const headerHeight = chatHeader?.offsetHeight || 73
          const inputHeight = inputContainer.offsetHeight
          const replyHeight = document.querySelector(".reply-preview")?.clientHeight || 0

          if (isKeyboardOpen) {
            // Calculate perfect available space
            const availableHeight = currentHeight - headerHeight - inputHeight - replyHeight - 10

            // Apply ultra-smooth transitions
            const transitionStyle = "all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)"

            // Chat container adjustments - FIXED HEIGHT
            chatContainer.style.transition = transitionStyle
            chatContainer.style.height = `${Math.max(availableHeight, 200)}px`
            chatContainer.style.maxHeight = `${availableHeight}px`
            chatContainer.style.overflowY = "auto"
            chatContainer.style.paddingBottom = "8px"

            // Input container - fixed positioning at bottom
            inputContainer.style.transition = transitionStyle
            inputContainer.style.position = "fixed"
            inputContainer.style.bottom = "0"
            inputContainer.style.left = "0"
            inputContainer.style.right = "0"
            inputContainer.style.zIndex = "1000"
            inputContainer.style.backgroundColor = "hsl(var(--card))"
            inputContainer.style.borderTop = "1px solid hsl(var(--border))"
            inputContainer.style.boxShadow = "0 -4px 12px rgba(0, 0, 0, 0.1)"

            // Header - ALWAYS FIXED AT TOP
            if (chatHeader) {
              chatHeader.style.transition = transitionStyle
              chatHeader.style.position = "fixed"
              chatHeader.style.top = "0"
              chatHeader.style.left = "0"
              chatHeader.style.right = "0"
              chatHeader.style.zIndex = "999"
              chatHeader.style.backgroundColor = "hsl(var(--card))"
              chatHeader.style.borderBottom = "1px solid hsl(var(--border))"
              chatHeader.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)"
            }

            // Add top padding to chat container to account for fixed header
            chatContainer.style.paddingTop = `${headerHeight + 10}px`
            chatContainer.style.marginTop = "0"

            // Smooth scroll to bottom after layout adjustment
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "end",
              })
            }, 350)
          } else {
            // COMPLETE RESET when keyboard closes - NO BLANK SPACE
            const resetTransition = "all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)"

            // Reset chat container completely
            chatContainer.style.transition = resetTransition
            chatContainer.style.height = ""
            chatContainer.style.maxHeight = ""
            chatContainer.style.overflowY = ""
            chatContainer.style.paddingBottom = ""
            chatContainer.style.paddingTop = ""
            chatContainer.style.marginTop = ""

            // Reset input container completely
            inputContainer.style.transition = resetTransition
            inputContainer.style.position = ""
            inputContainer.style.bottom = ""
            inputContainer.style.left = ""
            inputContainer.style.right = ""
            inputContainer.style.zIndex = ""
            inputContainer.style.backgroundColor = ""
            inputContainer.style.borderTop = ""
            inputContainer.style.boxShadow = ""

            // Reset header completely
            if (chatHeader) {
              chatHeader.style.transition = resetTransition
              chatHeader.style.position = ""
              chatHeader.style.top = ""
              chatHeader.style.left = ""
              chatHeader.style.right = ""
              chatHeader.style.zIndex = ""
              chatHeader.style.backgroundColor = ""
              chatHeader.style.borderBottom = ""
              chatHeader.style.boxShadow = ""
            }

            // Force complete layout recalculation to prevent blank space
            setTimeout(() => {
              if (chatContainer) {
                chatContainer.style.height = "auto"
                chatContainer.style.minHeight = "100%"
                chatContainer.style.display = "flex"
                chatContainer.style.flexDirection = "column"
              }
            }, 300)
          }

          isAdjusting = false
        })
      }, 50)
    }

    const handleResize = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout)

      resizeTimeout = setTimeout(() => {
        const newHeight = window.innerHeight
        setInitialViewportHeight(newHeight)
        setViewportHeight(newHeight)

        // Force complete reset if keyboard is not visible
        if (!isKeyboardVisible) {
          const chatContainer = chatContainerRef.current
          const inputContainer = inputContainerRef.current
          const chatHeader = document.querySelector("[data-chat-header]") as HTMLElement

          if (chatContainer) {
            chatContainer.style.height = ""
            chatContainer.style.maxHeight = ""
            chatContainer.style.paddingTop = ""
            chatContainer.style.marginTop = ""
            chatContainer.style.minHeight = "100%"
          }

          if (inputContainer) {
            inputContainer.style.position = ""
            inputContainer.style.bottom = ""
            inputContainer.style.left = ""
            inputContainer.style.right = ""
            inputContainer.style.zIndex = ""
          }

          if (chatHeader) {
            chatHeader.style.position = ""
            chatHeader.style.top = ""
            chatHeader.style.left = ""
            chatHeader.style.right = ""
            chatHeader.style.zIndex = ""
          }
        }
      }, 100)
    }

    const handleInputFocus = () => {
      setTimeout(() => {
        if (messageInputRef.current && isKeyboardVisible) {
          messageInputRef.current.scrollIntoView({
            behavior: "smooth",
            block: "center",
          })
        }
      }, 400)
    }

    const handleInputBlur = () => {
      // When input loses focus, ensure proper reset
      setTimeout(() => {
        if (!isKeyboardVisible) {
          const chatContainer = chatContainerRef.current
          const inputContainer = inputContainerRef.current
          const chatHeader = document.querySelector("[data-chat-header]") as HTMLElement

          if (chatContainer) {
            chatContainer.style.height = ""
            chatContainer.style.maxHeight = ""
            chatContainer.style.paddingTop = ""
            chatContainer.style.marginTop = ""
            chatContainer.style.minHeight = "100%"
          }

          if (inputContainer) {
            inputContainer.style.position = ""
            inputContainer.style.bottom = ""
            inputContainer.style.zIndex = ""
          }

          if (chatHeader) {
            chatHeader.style.position = ""
            chatHeader.style.top = ""
            chatHeader.style.zIndex = ""
          }
        }
      }, 200)
    }

    // Add event listeners with passive option for better performance
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportChange, { passive: true })
    }

    window.addEventListener("resize", handleResize, { passive: true })

    const messageInput = messageInputRef.current
    if (messageInput) {
      messageInput.addEventListener("focus", handleInputFocus, { passive: true })
      messageInput.addEventListener("blur", handleInputBlur, { passive: true })
    }

    return () => {
      if (keyboardTimeout) clearTimeout(keyboardTimeout)
      if (resizeTimeout) clearTimeout(resizeTimeout)

      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleViewportChange)
      }

      window.removeEventListener("resize", handleResize)

      if (messageInput) {
        messageInput.removeEventListener("focus", handleInputFocus)
        messageInput.removeEventListener("blur", handleInputBlur)
      }
    }
  }, [isMobile, initialViewportHeight, isKeyboardVisible])

  // Load groups with enhanced unread tracking
  useEffect(() => {
    if (!currentUser) return

    const groupsRef = ref(database, "groups")
    const unsubscribe = onValue(groupsRef, async (snapshot) => {
      if (!snapshot.exists()) {
        setGroups([])
        return
      }

      try {
        const groupsData = snapshot.val()
        const groupsList = await Promise.all(
          Object.keys(groupsData)
            .map(async (groupId) => {
              const groupData = groupsData[groupId]
              // Only include groups where current user is a member
              if (groupData.members && groupData.members[currentUser.uid]) {
                // Get unread count for this group
                const groupUnreadRef = ref(database, `groupUnread/${groupId}/${currentUser.uid}`)
                const unreadSnapshot = await get(groupUnreadRef)
                const unreadCount = unreadSnapshot.exists() ? unreadSnapshot.val().count || 0 : 0

                return {
                  id: groupId,
                  ...groupData,
                  unread: unreadCount,
                }
              }
              return null
            })
            .filter(Boolean),
        )

        const validGroups = (await Promise.all(groupsList)).filter(Boolean) as Group[]
        // Sort by timestamp (most recent first)
        validGroups.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        setGroups(validGroups)
      } catch (error) {
        console.error("Error loading groups:", error)
        toast({
          title: "Error",
          description: "Failed to load groups",
          variant: "destructive",
        })
      }
    })

    return () => unsubscribe()
  }, [currentUser, toast])

  // Enhanced contacts loading with better unread tracking
  useEffect(() => {
    if (!currentUser) return

    const contactsRef = ref(database, `contacts/${currentUser.uid}`)
    const unsubscribe = onValue(contactsRef, async (snapshot) => {
      if (!snapshot.exists()) {
        setContacts([])
        return
      }

      try {
        const contactsData = snapshot.val()
        const contactsList = await Promise.all(
          Object.keys(contactsData).map(async (contactUid) => {
            const contactData = contactsData[contactUid]

            // Get user profile for this contact
            const userRef = ref(database, `users/${contactUid}`)
            const userSnapshot = await get(userRef)

            if (userSnapshot.exists()) {
              const userData = userSnapshot.val()

              // Ensure unread count is properly set
              const unreadCount = Math.max(0, contactData.unread || 0)

              return {
                id: contactUid,
                uid: contactUid,
                name: contactData.name || userData.name || userData.email?.split("@")[0] || "Unknown",
                email: userData.email || "",
                avatar: userData.avatar || "",
                lastMessage: contactData.lastMessage || "",
                timestamp: contactData.timestamp || 0,
                unread: unreadCount,
                isOnline: userData.isOnline || false,
                lastSeen: userData.lastSeen || 0,
              }
            }
            return null
          }),
        )

        const validContacts = contactsList.filter(Boolean) as Contact[]
        validContacts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        setContacts(validContacts)
      } catch (error) {
        console.error("Error loading contacts:", error)
        toast({
          title: "Error",
          description: "Failed to load contacts",
          variant: "destructive",
        })
      }
    })

    return () => unsubscribe()
  }, [currentUser, setContacts, toast])

  // Load group messages when a group is selected and mark as read
  useEffect(() => {
    if (!currentUser || !selectedGroup) return

    const groupMessagesRef = ref(database, `groupMessages/${selectedGroup.id}`)
    const unsubscribe = onValue(groupMessagesRef, async (snapshot) => {
      if (!snapshot.exists()) {
        setGroupMessages((prev) => ({ ...prev, [selectedGroup.id]: [] }))
        return
      }

      try {
        const messagesData = snapshot.val()
        const messagesList = Object.keys(messagesData).map((key) => {
          const msgData = messagesData[key]
          return {
            id: key,
            ...msgData,
            sender: msgData.senderUid === currentUser.uid ? "user" : "contact",
            timestamp: typeof msgData.timestamp === "number" ? msgData.timestamp : msgData.clientTimestamp || 0,
            reactions: msgData.reactions || {},
            isDeleted: msgData.isDeleted || false,
          }
        })

        messagesList.sort((a, b) => a.timestamp - b.timestamp)
        setGroupMessages((prev) => ({ ...prev, [selectedGroup.id]: messagesList }))

        // Mark group messages as read when opening the group
        const groupUnreadRef = ref(database, `groupUnread/${selectedGroup.id}/${currentUser.uid}`)
        await set(groupUnreadRef, { count: 0, lastRead: Date.now() })

        // Update local groups state to reflect zero unread count
        setGroups((prevGroups) =>
          prevGroups.map((group) => {
            if (group.id === selectedGroup.id) {
              return { ...group, unread: 0 }
            }
            return group
          }),
        )
      } catch (err) {
        console.error("Error loading group messages:", err)
        toast({
          title: "Error",
          description: "Failed to load group messages",
          variant: "destructive",
        })
      }
    })

    return () => unsubscribe()
  }, [currentUser, selectedGroup, toast])

  // Auto-scroll to bottom with mobile header preservation - IMPROVED FOR PAGINATION
  useEffect(() => {
    // Only auto-scroll if we're not loading more messages
    if (isLoadingMore) return

    if (isMobile && (selectedContact || selectedGroup)) {
      // On mobile, scroll to bottom but preserve some space for header visibility
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "end",
          inline: "nearest",
        })
      }, 100)
    } else {
      // Desktop behavior remains the same
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages, groupMessages, selectedContact, selectedGroup, isMobile, isLoadingMore])

  // Handle typing indicators - OPTIMIZED
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      setNewMessage(value)

      // Debounce typing indicators to reduce lag
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }

      if (selectedContact && value.trim()) {
        startTyping(selectedContact.uid)

        typingTimeoutRef.current = setTimeout(() => {
          if (selectedContact) {
            stopTyping(selectedContact.uid)
          }
        }, 1000)
      } else if (selectedContact) {
        stopTyping(selectedContact.uid)
      }
    },
    [selectedContact, startTyping, stopTyping],
  )

  // Swipe to reply handlers - FIXED AND OPTIMIZED
  const handleTouchStart = useCallback(
    (e: React.TouchEvent, message: Message) => {
      if (!isMobile || message.isDeleted) return

      // Don't interfere if user is typing or scrolling
      if (document.activeElement === messageInputRef.current) return

      const touch = e.touches[0]
      setSwipeState({
        messageId: message.id,
        startX: touch.clientX,
        currentX: touch.clientX,
        isActive: true,
      })

      // Prevent default to avoid scrolling interference
      e.preventDefault()
    },
    [isMobile],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent, message: Message) => {
      if (!isMobile || !swipeState.isActive || swipeState.messageId !== message.id) return

      // Don't interfere if user is typing
      if (document.activeElement === messageInputRef.current) return

      const touch = e.touches[0]
      const deltaX = touch.clientX - swipeState.startX

      // Only allow right swipe (positive deltaX) and limit the distance
      if (deltaX > 0 && deltaX <= 120) {
        setSwipeState((prev) => ({
          ...prev,
          currentX: touch.clientX,
        }))

        // Prevent scrolling during swipe
        e.preventDefault()
      }
    },
    [isMobile, swipeState.isActive, swipeState.messageId, swipeState.startX],
  )

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent, message: Message) => {
      if (!isMobile || !swipeState.isActive || swipeState.messageId !== message.id) return

      const deltaX = swipeState.currentX - swipeState.startX

      // If swiped more than 60px, trigger reply
      if (deltaX > 60) {
        setReplyingTo(message)

        // Add haptic feedback if available
        if ("vibrate" in navigator) {
          navigator.vibrate([50])
        }

        // Focus input after a short delay
        setTimeout(() => {
          messageInputRef.current?.focus()
        }, 100)
      }

      // Reset swipe state
      setSwipeState({
        messageId: null,
        startX: 0,
        currentX: 0,
        isActive: false,
      })
    },
    [isMobile, swipeState],
  )

  const getSwipeTransform = useCallback(
    (messageId: string) => {
      if (!isMobile || swipeState.messageId !== messageId || !swipeState.isActive) return ""

      const deltaX = Math.max(0, Math.min(swipeState.currentX - swipeState.startX, 120))
      return `translateX(${deltaX}px)`
    },
    [isMobile, swipeState],
  )

  const getSwipeOpacity = useCallback(
    (messageId: string) => {
      if (!isMobile || swipeState.messageId !== messageId || !swipeState.isActive) return 0

      const deltaX = Math.max(0, Math.min(swipeState.currentX - swipeState.startX, 120))
      return Math.min(deltaX / 60, 1)
    },
    [isMobile, swipeState],
  )

  const getReplyIndicatorScale = useCallback(
    (messageId: string) => {
      if (!isMobile || swipeState.messageId !== messageId || !swipeState.isActive) return 0

      const deltaX = Math.max(0, Math.min(swipeState.currentX - swipeState.startX, 120))
      return Math.min(deltaX / 80, 1)
    },
    [isMobile, swipeState],
  )

  const handleMessageAction = (message: Message) => {
    setReplyingTo(message)
    messageInputRef.current?.focus()
  }

  // Load more messages handler
  const handleLoadMoreMessages = async () => {
    if (!selectedContact || isLoadingMore || !hasMoreMessages[selectedContact.id]) return

    setIsLoadingMore(true)
    try {
      await loadMoreMessages(selectedContact.id)
    } catch (error) {
      console.error("Failed to load more messages:", error)
      toast({
        title: "Error",
        description: "Failed to load more messages",
        variant: "destructive",
      })
    } finally {
      setIsLoadingMore(false)
    }
  }

  // Calling handlers
  const handleVoiceCall = () => {
    if (!selectedContact) return
    setCurrentCall({
      contact: selectedContact,
      type: "voice",
      isIncoming: false,
    })
    setShowCallingInterface(true)
  }

  const handleVideoCall = () => {
    if (!selectedContact) return
    setCurrentCall({
      contact: selectedContact,
      type: "video",
      isIncoming: false,
    })
    setShowCallingInterface(true)
  }

  const handleIncomingCall = (call: any) => {
    console.log("handleIncomingCall called with:", call)
    const contact = contacts.find((c) => c.id === call.callerId)
    console.log("Found contact for caller:", contact)

    if (contact) {
      console.log("Setting up incoming call state")
      setCurrentCall({
        contact,
        type: call.type,
        isIncoming: true,
      })
      setShowCallingInterface(true)
    } else {
      console.error("No contact found for caller ID:", call.callerId)
    }
  }

  const handleCallEnd = () => {
    setShowCallingInterface(false)
    setCurrentCall(null)
  }

  const handleAcceptCall = () => {
    // Call will be handled by the CallingInterface component
  }

  const handleRejectCall = (callId: string) => {
    setShowCallingInterface(false)
    setCurrentCall(null)
  }

  const handleSendMessage = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!newMessage.trim() && !replyingTo) return
      if ((!selectedContact && !selectedGroup) || isSending) return

      const messageText = newMessage.trim()
      setNewMessage("")
      setIsSending(true)

      try {
        if (selectedGroup) {
          // Send group message
          const groupMessagesRef = ref(database, `groupMessages/${selectedGroup.id}`)
          const newMessageRef = push(groupMessagesRef)

          const message = {
            text: messageText,
            senderUid: currentUser!.uid,
            senderName: userProfile?.name || currentUser!.email?.split("@")[0] || "Unknown",
            groupId: selectedGroup.id,
            timestamp: {
              ".sv": "timestamp",
            },
            clientTimestamp: Date.now(),
            status: "sent",
            reactions: {},
          }

          if (replyingTo) {
            message.replyToId = replyingTo.id
            message.replyToText = replyingTo.text
          }

          await set(newMessageRef, message)

          // Update group's last message
          const groupRef = ref(database, `groups/${selectedGroup.id}`)
          await update(groupRef, {
            lastMessage: messageText,
            timestamp: {
              ".sv": "timestamp",
            },
          })

          // Update unread count for all other group members
          const groupMembers = Object.keys(selectedGroup.members)
          const unreadPromises = groupMembers
            .filter((memberId) => memberId !== currentUser!.uid)
            .map(async (memberId) => {
              const memberUnreadRef = ref(database, `groupUnread/${selectedGroup.id}/${memberId}`)
              const currentUnreadSnapshot = await get(memberUnreadRef)
              const currentCount = currentUnreadSnapshot.exists() ? currentUnreadSnapshot.val().count || 0 : 0

              return set(memberUnreadRef, {
                count: currentCount + 1,
                lastMessage: messageText,
                timestamp: Date.now(),
              })
            })

          await Promise.all(unreadPromises)
        } else if (selectedContact) {
          // Send direct message
          await sendMessage(messageText, replyingTo?.id, undefined, undefined, undefined)
          if (selectedContact) {
            stopTyping(selectedContact.uid)
          }
        }

        setReplyingTo(null)
        // Re-focus the input after sending
        setTimeout(() => {
          messageInputRef.current?.focus()
        }, 100)
      } catch (error) {
        console.error("Failed to send message:", error)
        toast({
          title: "Error",
          description: "Failed to send message. Please try again.",
          variant: "destructive",
        })
        setNewMessage(messageText)
      } finally {
        setIsSending(false)
      }
    },
    [
      newMessage,
      selectedContact,
      selectedGroup,
      sendMessage,
      replyingTo,
      isSending,
      toast,
      stopTyping,
      currentUser,
      userProfile,
      database,
    ],
  )

  const handleAddContact = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!newContactEmail.trim() || !currentUser) return

    try {
      // Find user by email
      const usersRef = ref(database, "users")
      const userQuery = query(usersRef, orderByChild("email"), equalTo(newContactEmail.trim()))
      const snapshot = await get(userQuery)

      if (!snapshot.exists()) {
        toast({
          title: "User not found",
          description: "No user found with this email address",
          variant: "destructive",
        })
        return
      }

      const userData = Object.values(snapshot.val())[0] as any
      const contactUid = userData.uid

      if (contactUid === currentUser.uid) {
        toast({
          title: "Invalid contact",
          description: "You cannot add yourself as a contact",
          variant: "destructive",
        })
        return
      }

      // Check if contact already exists
      const existingContactRef = ref(database, `contacts/${currentUser.uid}/${contactUid}`)
      const existingSnapshot = await get(existingContactRef)

      if (existingSnapshot.exists()) {
        toast({
          title: "Contact exists",
          description: "This contact is already in your list",
        })
        return
      }

      // Add contact for current user
      await set(existingContactRef, {
        name: userData.name || userData.email?.split("@")[0] || "Unknown",
        email: userData.email,
        addedAt: Date.now(),
        lastMessage: "",
        timestamp: 0,
        unread: 0,
      })

      // Add current user as contact for the other user
      const reverseContactRef = ref(database, `contacts/${contactUid}/${currentUser.uid}`)
      await set(reverseContactRef, {
        name: userProfile?.name || currentUser.email?.split("@")[0] || "Unknown",
        email: currentUser.email,
        addedAt: Date.now(),
        lastMessage: "",
        timestamp: 0,
        unread: 0,
      })

      toast({
        title: "Contact added",
        description: `${userData.name || userData.email} has been added to your contacts`,
      })

      setNewContactEmail("")
      setShowAddContact(false)
    } catch (error) {
      console.error("Error adding contact:", error)
      toast({
        title: "Error",
        description: "Failed to add contact. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleFileUpload = async (fileUrl: string, fileType: string, fileName: string) => {
    if (!selectedContact && !selectedGroup) return

    try {
      if (selectedGroup) {
        // Send file to group
        const groupMessagesRef = ref(database, `groupMessages/${selectedGroup.id}`)
        const newMessageRef = push(groupMessagesRef)

        const message = {
          text: "",
          senderUid: currentUser!.uid,
          senderName: userProfile?.name || currentUser!.email?.split("@")[0] || "Unknown",
          groupId: selectedGroup.id,
          timestamp: {
            ".sv": "timestamp",
          },
          clientTimestamp: Date.now(),
          status: "sent",
          fileUrl,
          fileType,
          fileName,
          reactions: {},
        }

        await set(newMessageRef, message)

        // Update group's last message
        const groupRef = ref(database, `groups/${selectedGroup.id}`)
        await update(groupRef, {
          lastMessage: `📎 ${fileName}`,
          timestamp: {
            ".sv": "timestamp",
          },
        })

        // Update unread count for all other group members
        const groupMembers = Object.keys(selectedGroup.members)
        const unreadPromises = groupMembers
          .filter((memberId) => memberId !== currentUser!.uid)
          .map(async (memberId) => {
            const memberUnreadRef = ref(database, `groupUnread/${selectedGroup.id}/${memberId}`)
            const currentUnreadSnapshot = await get(memberUnreadRef)
            const currentCount = currentUnreadSnapshot.exists() ? currentUnreadSnapshot.val().count || 0 : 0

            return set(memberUnreadRef, {
              count: currentCount + 1,
              lastMessage: `📎 ${fileName}`,
              timestamp: Date.now(),
            })
          })

        await Promise.all(unreadPromises)
      } else {
        await sendMessage("", undefined, fileUrl, fileType, fileName)
      }

      toast({
        title: "File sent",
        description: "Your file has been sent successfully",
      })
    } catch (error) {
      console.error("Failed to send file:", error)
      toast({
        title: "Error",
        description: "Failed to send file. Please try again.",
      })
    }
  }

  const handleFileDrop = (files: File[]) => {
    console.log("Files dropped:", files)
  }

  const handleDeleteMessage = async (message: Message) => {
    if (!selectedContact && !selectedGroup) return

    try {
      if (selectedGroup) {
        // Delete group message
        const messageRef = ref(database, `groupMessages/${selectedGroup.id}/${message.id}`)
        await update(messageRef, {
          text: "",
          fileUrl: "",
          fileType: "",
          fileName: "",
          isDeleted: true,
          deletedAt: Date.now(),
          deletedBy: currentUser!.uid,
        })
      } else if (selectedContact) {
        await deleteMessage(message.id, selectedContact.uid)
      }

      toast({
        title: "Message deleted",
        description: "Your message has been deleted",
      })
    } catch (error) {
      console.error("Failed to delete message:", error)
      toast({
        title: "Error",
        description: "Failed to delete message. Please try again.",
      })
    }
  }

  const handleMessageContextMenu = (e: React.MouseEvent, message: Message) => {
    e.preventDefault()
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      message,
    })
  }

  const handleCopyMessage = (message: Message) => {
    if (message.text) {
      navigator.clipboard.writeText(message.text)
      toast({
        title: "Copied",
        description: "Message copied to clipboard",
      })
    }
  }

  const handleReaction = async (message: Message, emoji: string) => {
    if (!selectedContact && !selectedGroup) return

    try {
      if (selectedGroup) {
        // Add reaction to group message
        const messageRef = ref(database, `groupMessages/${selectedGroup.id}/${message.id}`)
        const messageSnapshot = await get(messageRef)

        if (!messageSnapshot.exists()) return

        const messageData = messageSnapshot.val()
        const reactions = messageData.reactions || {}

        if (!reactions[emoji]) {
          reactions[emoji] = {
            users: [],
            userNames: {},
          }
        }

        const userIndex = reactions[emoji].users.indexOf(currentUser!.uid)

        if (userIndex > -1) {
          reactions[emoji].users.splice(userIndex, 1)
          delete reactions[emoji].userNames[currentUser!.uid]

          if (reactions[emoji].users.length === 0) {
            delete reactions[emoji]
          }
        } else {
          reactions[emoji].users.push(currentUser!.uid)
          reactions[emoji].userNames[currentUser!.uid] = userProfile?.name || "Unknown"
        }

        await update(messageRef, { reactions })
      } else if (selectedContact) {
        await addReaction(message.id, emoji, selectedContact.uid)
      }
    } catch (error) {
      console.error("Failed to add reaction:", error)
      toast({
        title: "Error",
        description: "Failed to add reaction. Please try again.",
      })
    }
  }

  const handleReactionClick = async (messageId: string, emoji: string) => {
    if (!selectedContact && !selectedGroup) return

    try {
      if (selectedGroup) {
        const messageRef = ref(database, `groupMessages/${selectedGroup.id}/${messageId}`)
        const messageSnapshot = await get(messageRef)

        if (!messageSnapshot.exists()) return

        const messageData = messageSnapshot.val()
        const reactions = messageData.reactions || {}

        if (!reactions[emoji]) {
          reactions[emoji] = {
            users: [],
            userNames: {},
          }
        }

        const userIndex = reactions[emoji].users.indexOf(currentUser!.uid)

        if (userIndex > -1) {
          reactions[emoji].users.splice(userIndex, 1)
          delete reactions[emoji].userNames[currentUser!.uid]

          if (reactions[emoji].users.length === 0) {
            delete reactions[emoji]
          }
        } else {
          reactions[emoji].users.push(currentUser!.uid)
          reactions[emoji].userNames[currentUser!.uid] = userProfile?.name || "Unknown"
        }

        await update(messageRef, { reactions })
      } else if (selectedContact) {
        await addReaction(messageId, emoji, selectedContact.uid)
      }
    } catch (error) {
      console.error("Failed to toggle reaction:", error)
      toast({
        title: "Error",
        description: "Failed to toggle reaction. Please try again.",
      })
    }
  }

  const filteredContacts = contacts.filter(
    (contact) =>
      contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.email.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const filteredGroups = groups.filter((group) => group.name.toLowerCase().includes(searchQuery.toLowerCase()))

  const currentMessages = selectedContact
    ? messages[selectedContact.id] || []
    : selectedGroup
      ? groupMessages[selectedGroup.id] || []
      : []

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    } else {
      return date.toLocaleDateString()
    }
  }

  const getGroupAvatar = (group: Group) => {
    if (group.avatar) return group.avatar

    // Generate a colorful avatar based on group name
    const colors = [
      "bg-red-500",
      "bg-blue-500",
      "bg-green-500",
      "bg-yellow-500",
      "bg-purple-500",
      "bg-pink-500",
      "bg-indigo-500",
    ]
    const colorIndex = group.name.charCodeAt(0) % colors.length
    return colors[colorIndex]
  }

  // Get message bubble styles based on theme with animated outline
  const getMessageBubbleStyle = (sender: "user" | "contact", isDeleted = false) => {
    if (isDeleted) {
      // Use theme colors for deleted messages
      const deletedBg = currentTheme.colors.muted ? `hsl(${currentTheme.colors.muted})` : "hsl(var(--muted))"
      const deletedText = currentTheme.colors.mutedForeground
        ? `hsl(${currentTheme.colors.mutedForeground})`
        : `hsl(var(--muted-foreground))`
      return `italic border border-opacity-50`
    }

    const baseClasses = "relative transition-all duration-300 ease-in-out"
    const outlineClasses = "ring-2 ring-offset-2 ring-offset-transparent"

    if (currentTheme.colors.messageSent && currentTheme.colors.messageReceived) {
      // Add animated ring color based on theme
      const ringColor =
        sender === "user" ? currentTheme.colors.primary || "220 100% 50%" : currentTheme.colors.accent || "210 100% 50%"

      return `${baseClasses} ${outlineClasses} hover:ring-[hsl(${ringColor})] hover:shadow-lg hover:shadow-[hsl(${ringColor})/20%]`
    }

    // Default fallback with blue outline
    return sender === "user"
      ? `${baseClasses} bg-white text-black ${outlineClasses} hover:ring-blue-500 hover:shadow-lg hover:shadow-blue-500/20`
      : `${baseClasses} bg-gray-800 text-white ${outlineClasses} hover:ring-blue-400 hover:shadow-lg hover:shadow-blue-400/20`
  }

  // Get tab styles for better visibility
  const getTabStyles = (isActive: boolean) => {
    const baseClasses = "transition-all duration-200 ease-in-out relative"

    if (isActive) {
      // Make active tab more visible with better contrast
      const activeColor = currentTheme.colors.primary ? `hsl(${currentTheme.colors.primary})` : "hsl(var(--primary))"
      const activeBg = currentTheme.colors.accent ? `hsl(${currentTheme.colors.accent}/20%)` : "hsl(var(--accent)/20%)"

      return `${baseClasses} font-semibold border-b-2 border-[${activeColor}] bg-[${activeBg}] text-[${activeColor}]`
    }

    return `${baseClasses} hover:bg-[hsl(var(--accent)/10%)] text-[hsl(var(--muted-foreground))]`
  }

  const handleChatContextMenu = (e: React.MouseEvent, contact?: Contact, group?: Group) => {
    e.preventDefault()
    setChatContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      contact: contact || null,
      group: group || null,
    })
  }

  const handlePinChat = async (chatId: string, isGroup = false) => {
    if (!currentUser) return

    try {
      const newPinnedChats = new Set(pinnedChats)
      const isPinned = pinnedChats.has(chatId)

      if (isPinned) {
        newPinnedChats.delete(chatId)
      } else {
        newPinnedChats.add(chatId)
      }

      setPinnedChats(newPinnedChats)

      // Save to Firebase
      const pinnedRef = ref(database, `pinnedChats/${currentUser.uid}`)
      await set(pinnedRef, Array.from(newPinnedChats))

      toast({
        title: isPinned ? "Chat unpinned" : "Chat pinned",
        description: isPinned ? "Chat has been unpinned" : "Chat has been pinned to top",
      })
    } catch (error) {
      console.error("Error pinning chat:", error)
      toast({
        title: "Error",
        description: "Failed to pin/unpin chat",
        variant: "destructive",
      })
    }

    setChatContextMenu({ visible: false, x: 0, y: 0, contact: null, group: null })
  }

  const handleArchiveChat = async (chatId: string, isGroup = false) => {
    if (!currentUser) return

    try {
      const newArchivedChats = new Set(archivedChats)
      const isArchived = archivedChats.has(chatId)

      if (isArchived) {
        newArchivedChats.delete(chatId)
      } else {
        newArchivedChats.add(chatId)
        // Remove from pinned if archived
        const newPinnedChats = new Set(pinnedChats)
        newPinnedChats.delete(chatId)
        setPinnedChats(newPinnedChats)

        // Save pinned chats to Firebase
        const pinnedRef = ref(database, `pinnedChats/${currentUser.uid}`)
        await set(pinnedRef, Array.from(newPinnedChats))
      }

      setArchivedChats(newArchivedChats)

      // Save to Firebase
      const archivedRef = ref(database, `archivedChats/${currentUser.uid}`)
      await set(archivedRef, Array.from(newArchivedChats))

      // If currently viewing archived chat, close it
      if (isArchived && (selectedContact?.id === chatId || selectedGroup?.id === chatId)) {
        setSelectedContact(null)
        setSelectedGroup(null)
      }

      // If this was the last archived chat and we're in archived view, return to main view
      if (isArchived && newArchivedChats.size === 0 && showArchivedChats) {
        setShowArchivedChats(false)
      }

      toast({
        title: isArchived ? "Chat unarchived" : "Chat archived",
        description: isArchived ? "Chat moved back to main list" : "Chat moved to archived",
      })
    } catch (error) {
      console.error("Error archiving chat:", error)
      toast({
        title: "Error",
        description: "Failed to archive/unarchive chat",
        variant: "destructive",
      })
    }

    setChatContextMenu({ visible: false, x: 0, y: 0, contact: null, group: null })
  }

  const handleDeleteChat = async (chatId: string, isGroup = false) => {
    if (!currentUser) return

    try {
      if (isGroup) {
        // Clear group messages for this user
        const groupMessagesRef = ref(database, `groupMessages/${chatId}`)
        // Note: In a real app, you might want to just hide the group for this user
        // rather than deleting all messages

        // Remove from pinned and archived chats if present
        const newPinnedChats = new Set(pinnedChats)
        const newArchivedChats = new Set(archivedChats)
        newPinnedChats.delete(chatId)
        newArchivedChats.delete(chatId)
        setPinnedChats(newPinnedChats)
        setArchivedChats(newArchivedChats)

        if (selectedGroup?.id === chatId) {
          setSelectedGroup(null)
        }
      } else {
        // Clear chat messages
        const chatRef = ref(database, `chats/${currentUser.uid}/${chatId}`)
        await set(chatRef, null)

        // Clear contact's last message
        const contactRef = ref(database, `contacts/${currentUser.uid}/${chatId}`)
        await update(contactRef, {
          lastMessage: "",
          timestamp: 0,
          unread: 0,
        })

        // Remove from pinned and archived chats if present
        const newPinnedChats = new Set(pinnedChats)
        const newArchivedChats = new Set(archivedChats)
        newPinnedChats.delete(chatId)
        newArchivedChats.delete(chatId)
        setPinnedChats(newPinnedChats)
        setArchivedChats(newArchivedChats)

        if (selectedContact?.id === chatId) {
          setSelectedContact(null)
        }
      }

      toast({
        title: "Chat deleted",
        description: "Chat has been deleted successfully",
      })
    } catch (error) {
      console.error("Error deleting chat:", error)
      toast({
        title: "Error",
        description: "Failed to delete chat",
        variant: "destructive",
      })
    }

    setChatContextMenu({ visible: false, x: 0, y: 0, contact: null, group: null })
  }

  // Mark as read handler
  const handleMarkAsRead = async (chatId: string, isGroup = false) => {
    if (!currentUser) return

    try {
      if (isGroup) {
        // Mark group messages as read
        const groupUnreadRef = ref(database, `groupUnread/${chatId}/${currentUser.uid}`)
        await set(groupUnreadRef, { count: 0, lastRead: Date.now() })

        // Update local groups state
        setGroups((prevGroups) =>
          prevGroups.map((group) => {
            if (group.id === chatId) {
              return { ...group, unread: 0 }
            }
            return group
          }),
        )
      } else {
        // Mark contact messages as read
        const contactRef = ref(database, `contacts/${currentUser.uid}/${chatId}`)
        await update(contactRef, { unread: 0 })

        // Update local contacts state
        setContacts((prevContacts) =>
          prevContacts.map((contact) => {
            if (contact.id === chatId) {
              return { ...contact, unread: 0 }
            }
            return contact
          }),
        )
      }

      toast({
        title: "Marked as read",
        description: "All messages have been marked as read",
      })
    } catch (error) {
      console.error("Error marking as read:", error)
      toast({
        title: "Error",
        description: "Failed to mark as read",
        variant: "destructive",
      })
    }

    setChatContextMenu({ visible: false, x: 0, y: 0, contact: null, group: null })
  }

  // Enhanced sorting with archive filtering
  const getVisibleContacts = () => {
    if (showArchivedChats) {
      return filteredContacts.filter((contact) => archivedChats.has(contact.id))
    }
    return filteredContacts.filter((contact) => !archivedChats.has(contact.id))
  }

  const getVisibleGroups = () => {
    if (showArchivedChats) {
      return filteredGroups.filter((group) => archivedChats.has(group.id))
    }
    return filteredGroups.filter((group) => !archivedChats.has(group.id))
  }

  const sortedContacts = [...getVisibleContacts()].sort((a, b) => {
    if (showArchivedChats) {
      // In archived view, just sort by timestamp
      return (b.timestamp || 0) - (a.timestamp || 0)
    }

    const aIsPinned = pinnedChats.has(a.id)
    const bIsPinned = pinnedChats.has(b.id)

    // Pinned chats first
    if (aIsPinned && !bIsPinned) return -1
    if (!aIsPinned && bIsPinned) return 1

    // Then by timestamp
    return (b.timestamp || 0) - (a.timestamp || 0)
  })

  const sortedGroups = [...getVisibleGroups()].sort((a, b) => {
    if (showArchivedChats) {
      // In archived view, just sort by timestamp
      return (b.timestamp || 0) - (a.timestamp || 0)
    }

    const aIsPinned = pinnedChats.has(a.id)
    const bIsPinned = pinnedChats.has(b.id)

    // Pinned chats first
    if (aIsPinned && !bIsPinned) return -1
    if (!aIsPinned && bIsPinned) return 1

    // Then by timestamp
    return (b.timestamp || 0) - (a.timestamp || 0)
  })

  // Load pinned and archived chats from Firebase
  useEffect(() => {
    if (!currentUser) return

    const pinnedRef = ref(database, `pinnedChats/${currentUser.uid}`)
    const archivedRef = ref(database, `archivedChats/${currentUser.uid}`)

    const unsubscribePinned = onValue(pinnedRef, (snapshot) => {
      if (snapshot.exists()) {
        const pinnedArray = snapshot.val()
        setPinnedChats(new Set(Array.isArray(pinnedArray) ? pinnedArray : []))
      } else {
        setPinnedChats(new Set())
      }
    })

    const unsubscribeArchived = onValue(archivedRef, (snapshot) => {
      if (snapshot.exists()) {
        const archivedArray = snapshot.val()
        setArchivedChats(new Set(Array.isArray(archivedArray) ? archivedArray : []))
      } else {
        setArchivedChats(new Set())
      }
    })

    return () => {
      unsubscribePinned()
      unsubscribeArchived()
    }
  }, [currentUser])

  // Auto-return to main view when all archives are removed
  useEffect(() => {
    if (showArchivedChats && archivedChats.size === 0) {
      setShowArchivedChats(false)
    }
  }, [showArchivedChats, archivedChats.size])

  // Listen for calls from contact profile drawer
  useEffect(() => {
    const handleStartCall = (event: CustomEvent) => {
      const { contact, type } = event.detail

      setCurrentCall({
        contact: contact,
        type: type,
        isIncoming: false,
      })
      setShowCallingInterface(true)
    }

    window.addEventListener("startCall", handleStartCall as EventListener)

    return () => {
      window.removeEventListener("startCall", handleStartCall as EventListener)
    }
  }, [])

  // Debug incoming call notifications
  useEffect(() => {
    console.log("Current user:", currentUser?.uid)
    console.log(
      "Contacts:",
      contacts.map((c) => ({ id: c.id, name: c.name })),
    )
  }, [currentUser, contacts])

  return (
    <DragDropZone onFileDrop={handleFileDrop}>
      <div className="flex h-screen bg-background text-foreground">
        {/* Incoming Call Notification */}
        <IncomingCallNotification onAccept={handleIncomingCall} onReject={handleRejectCall} />

        {/* Calling Interface */}
        {showCallingInterface && currentCall && (
          <CallingInterface
            isOpen={showCallingInterface}
            onClose={handleCallEnd}
            contact={currentCall.contact}
            callType={currentCall.type}
            isIncoming={currentCall.isIncoming}
            onAccept={handleAcceptCall}
            onReject={() => handleRejectCall("")}
          />
        )}

        {/* Sidebar */}
        <div
          className={`${
            isMobile ? (selectedContact || selectedGroup ? "hidden" : "flex w-full") : "flex w-[420px]"
          } flex-col border-r border-border bg-card h-screen overflow-hidden text-foreground`}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-card">
            <div className="flex items-center space-x-3">
              <Avatar className="h-10 w-10 cursor-pointer" onClick={() => setShowUserProfile(true)}>
                <AvatarImage src={userProfile?.avatar || "/placeholder.svg?height=40&width=40"} />
                <AvatarFallback className="bg-muted">
                  {userProfile?.name?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-foreground truncate">{userProfile?.name || "User"}</h2>
                <p className="text-xs text-muted-foreground">Online</p>
              </div>
            </div>
            <div className="flex space-x-2 flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground hover:bg-accent"
                onClick={() => (activeTab === "chats" ? setShowAddContact(true) : setShowGroupCreation(true))}
              >
                <Plus className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground hover:bg-accent"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setShowUserProfile(true)
                }}
              >
                <Settings className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground hover:bg-accent"
                onClick={logout}
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Enhanced Tabs with Better Visibility */}
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as "chats" | "groups")}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="grid w-full grid-cols-2 bg-muted border-b border-border p-1">
              <button
                className={`${getTabStyles(activeTab === "chats")} flex items-center justify-center gap-2 px-4 py-3 rounded-md relative`}
                onClick={() => setActiveTab("chats")}
              >
                <User className="h-4 w-4 flex-shrink-0" />
                <span className="font-medium">Chats</span>
                {totalUnreadChats > 0 && (
                  <div className="absolute -top-1 -right-1">
                    <UnreadBadge count={totalUnreadChats} />
                  </div>
                )}
                {activeTab === "chats" && (
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-current"
                    layoutId="activeTab"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </button>
              <button
                className={`${getTabStyles(activeTab === "groups")} flex items-center justify-center gap-2 px-4 py-3 rounded-md relative`}
                onClick={() => setActiveTab("groups")}
              >
                <Users className="h-4 w-4 flex-shrink-0" />
                <span className="font-medium">Groups</span>
                {totalUnreadGroups > 0 && (
                  <div className="absolute -top-1 -right-1">
                    <UnreadBadge count={totalUnreadGroups} />
                  </div>
                )}
                {activeTab === "groups" && (
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-current"
                    layoutId="activeTab"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </button>
            </div>

            {/* Search */}
            <div className="p-4 bg-card flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={`Search ${activeTab}...`}
                  className="border-border bg-background pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Archive Toggle Button */}
            {archivedChats.size > 0 && (
              <div className="px-4 pb-2">
                <motion.button
                  className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-all duration-200"
                  onClick={() => setShowArchivedChats(!showArchivedChats)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-orange-500/20 text-orange-600 dark:text-orange-400">
                      <Archive className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="font-medium text-foreground">
                        {showArchivedChats ? "Back to Chats" : "Archived"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {archivedChats.size} archived {archivedChats.size === 1 ? "chat" : "chats"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {totalArchivedUnread > 0 && !showArchivedChats && <UnreadBadge count={totalArchivedUnread} />}
                    <motion.div
                      animate={{ rotate: showArchivedChats ? 180 : 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    >
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </motion.div>
                  </div>
                </motion.button>
              </div>
            )}

            <TabsContent value="chats" className="flex-1 mt-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-1 p-2">
                  <AnimatePresence mode="popLayout">
                    {sortedContacts.length > 0 ? (
                      sortedContacts.map((contact) => (
                        <motion.div
                          key={contact.id}
                          layout
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{
                            layout: { type: "spring", stiffness: 400, damping: 30 },
                            opacity: { duration: 0.2 },
                            y: { duration: 0.2 },
                          }}
                          className={`flex cursor-pointer items-center space-x-3 rounded-lg p-3 transition-all duration-200 relative
${
  selectedContact?.id === contact.id
    ? "bg-primary/20 dark:bg-primary/30 border border-primary/50 shadow-sm shadow-primary/20"
    : "hover:bg-accent/30"
}`}
                          onClick={() => {
                            setSelectedContact(contact)
                            setSelectedGroup(null)
                          }}
                          onContextMenu={(e) => handleChatContextMenu(e, contact)}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          {/* Pin indicator - Only show if not in archived view */}
                          {!showArchivedChats && pinnedChats.has(contact.id) && (
                            <div className="absolute top-1 right-1 text-yellow-500">
                              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M4 3a2 2 0 00-2 2v1.5h16V5a2 2 0 00-2-2H4z" />
                                <path
                                  fillRule="evenodd"
                                  d="M18 8.5H2V10a2 2 0 002 2h14a2 2 0 002-2V8.5zM4 13a2 2 0 00-2 2v1.5h16V15a2 2 0 00-2-2H4z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </div>
                          )}

                          {/* Archive indicator - Only show in archived view */}
                          {showArchivedChats && (
                            <div className="absolute top-1 right-1 text-orange-500">
                              <Archive className="h-3 w-3" />
                            </div>
                          )}

                          {/* Rest of the contact content remains the same */}
                          <div className="relative flex-shrink-0">
                            <Avatar className="h-12 w-12">
                              <AvatarImage src={contact.avatar || "/placeholder.svg?height=48&width=48"} />
                              <AvatarFallback className="bg-muted">
                                {contact.name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            {contact.isOnline && (
                              <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-green-500"></div>
                            )}
                          </div>
                          <div className="flex-1 overflow-hidden min-w-0">
                            <div className="flex items-center justify-between">
                              <h3 className="font-medium truncate text-foreground">{contact.name}</h3>
                              <div className="flex items-center space-x-2 flex-shrink-0">
                                <span className="text-xs text-muted-foreground">
                                  {contact.timestamp ? formatTime(contact.timestamp) : ""}
                                </span>
                                {contact.unread && contact.unread > 0 && <UnreadBadge count={contact.unread} />}
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-muted-foreground truncate">
                                {typingUsers[contact.id] ? (
                                  <motion.span
                                    className="text-green-400"
                                    animate={{ opacity: [0.5, 1, 0.5] }}
                                    transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
                                  >
                                    typing...
                                  </motion.span>
                                ) : (
                                  contact.lastMessage || "No messages yet"
                                )}
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        {showArchivedChats ? (
                          <>
                            <Archive className="h-12 w-12 text-muted-foreground mb-4" />
                            <p className="text-foreground">No archived contacts</p>
                            <p className="text-sm text-muted-foreground mt-1">Archived chats will appear here</p>
                          </>
                        ) : (
                          <>
                            <User className="h-12 w-12 text-muted-foreground mb-4" />
                            <p className="text-foreground">No contacts found</p>
                            <p className="text-sm text-muted-foreground mt-1">Add some contacts to start chatting</p>
                          </>
                        )}
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="groups" className="flex-1 mt-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-1 p-2">
                  <AnimatePresence mode="popLayout">
                    {sortedGroups.length > 0 ? (
                      sortedGroups.map((group) => (
                        <motion.div
                          key={group.id}
                          layout
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{
                            layout: { type: "spring", stiffness: 400, damping: 30 },
                            opacity: { duration: 0.2 },
                            y: { duration: 0.2 },
                          }}
                          className={`flex cursor-pointer items-center space-x-3 rounded-lg p-3 transition-all duration-200 relative
${
  selectedGroup?.id === group.id
    ? "bg-primary/20 dark:bg-primary/30 border border-primary/50 shadow-sm shadow-primary/20"
    : "hover:bg-accent/30"
}`}
                          onClick={() => {
                            setSelectedGroup(group)
                            setSelectedContact(null)
                          }}
                          onContextMenu={(e) => handleChatContextMenu(e, undefined, group)}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          {/* Pin indicator - Only show if not in archived view */}
                          {!showArchivedChats && pinnedChats.has(group.id) && (
                            <div className="absolute top-1 right-1 text-yellow-500">
                              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M4 3a2 2 0 00-2 2v1.5h16V5a2 2 0 00-2-2H4z" />
                                <path
                                  fillRule="evenodd"
                                  d="M18 8.5H2V10a2 2 0 002 2h14a2 2 0 002-2V8.5zM4 13a2 2 0 00-2 2v1.5h16V15a2 2 0 00-2-2H4z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </div>
                          )}

                          {/* Archive indicator - Only show in archived view */}
                          {showArchivedChats && (
                            <div className="absolute top-1 right-1 text-orange-500">
                              <Archive className="h-3 w-3" />
                            </div>
                          )}

                          {/* Rest of the group content remains the same */}
                          <div className="relative flex-shrink-0">
                            <Avatar className="h-12 w-12">
                              {group.avatar ? (
                                <AvatarImage src={group.avatar || "/placeholder.svg"} />
                              ) : (
                                <AvatarFallback className={`${getGroupAvatar(group)} text-white`}>
                                  <Users className="h-6 w-6" />
                                </AvatarFallback>
                              )}
                            </Avatar>
                            {group.createdBy === currentUser?.uid && (
                              <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-yellow-500 border-2 border-card flex items-center justify-center">
                                <Crown className="h-3 w-3 text-white" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 overflow-hidden min-w-0">
                            <div className="flex items-center justify-between">
                              <h3 className="font-medium truncate text-foreground">{group.name}</h3>
                              <div className="flex items-center space-x-2 flex-shrink-0">
                                <span className="text-xs text-muted-foreground">
                                  {group.timestamp ? formatTime(group.timestamp) : ""}
                                </span>
                                {group.unread && group.unread > 0 && <UnreadBadge count={group.unread} />}
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-muted-foreground truncate">
                                {group.lastMessage || "No messages yet"}
                              </p>
                              <span className="text-xs text-muted-foreground flex-shrink-0">
                                {Object.keys(group.members).length} members
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        {showArchivedChats ? (
                          <>
                            <Archive className="h-12 w-12 text-muted-foreground mb-4" />
                            <p className="text-foreground">No archived groups</p>
                            <p className="text-sm text-muted-foreground mt-1">Archived groups will appear here</p>
                          </>
                        ) : (
                          <>
                            <Users className="h-12 w-12 text-muted-foreground mb-4" />
                            <p className="text-foreground">No groups found</p>
                            <p className="text-sm text-muted-foreground mt-1">Create a group to start chatting</p>
                          </>
                        )}
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>

        {/* Chat Area */}
        <div
          className={`${
            isMobile ? (selectedContact || selectedGroup ? "flex w-full" : "hidden") : "flex flex-1"
          } flex-col`}
        >
          {selectedContact || selectedGroup ? (
            <>
              {/* Chat Header */}
              <div
                data-chat-header
                className={`flex items-center justify-between border-b border-border bg-card p-4 transition-all duration-300 ${
                  isMobile ? "relative z-50" : ""
                }`}
              >
                <div className="flex items-center space-x-3">
                  {isMobile && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={handleBackNavigation}
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                  )}
                  <Avatar
                    className="h-10 w-10 cursor-pointer"
                    onClick={() => (selectedContact ? setShowContactProfile(true) : setShowGroupProfile(true))}
                  >
                    {selectedContact ? (
                      <>
                        <AvatarImage src={selectedContact.avatar || "/placeholder.svg?height=40&width=40"} />
                        <AvatarFallback className="bg-muted">
                          {selectedContact.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </>
                    ) : selectedGroup ? (
                      <>
                        {selectedGroup.avatar ? (
                          <AvatarImage src={selectedGroup.avatar || "/placeholder.svg"} />
                        ) : (
                          <AvatarFallback className={`${getGroupAvatar(selectedGroup)} text-white`}>
                            <Users className="h-5 w-5" />
                          </AvatarFallback>
                        )}
                      </>
                    ) : null}
                  </Avatar>
                  <div>
                    <h3 className="font-semibold">{selectedContact?.name || selectedGroup?.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {selectedContact ? (
                        typingUsers[selectedContact.id] ? (
                          <motion.span
                            className="text-green-400"
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
                          >
                            typing...
                          </motion.span>
                        ) : selectedContact.isOnline ? (
                          "Online"
                        ) : selectedContact.lastSeen ? (
                          `Last seen ${formatDistanceToNow(new Date(selectedContact.lastSeen), { addSuffix: true })}`
                        ) : (
                          "Offline"
                        )
                      ) : selectedGroup ? (
                        `${Object.keys(selectedGroup.members).length} members`
                      ) : null}
                    </p>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={handleVoiceCall}
                    disabled={!selectedContact} // Only enable for direct contacts, not groups
                  >
                    <Phone className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={handleVideoCall}
                    disabled={!selectedContact} // Only enable for direct contacts, not groups
                  >
                    <Video className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      if (selectedContact) {
                        setShowContactProfile(true)
                      } else if (selectedGroup) {
                        setShowGroupProfile(true)
                      }
                    }}
                  >
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {/* Messages with Enhanced Styling and Swipe Support */}
              <ScrollArea
                ref={chatContainerRef}
                className={`flex-1 p-4 transition-all duration-300 ${
                  isMobile && isKeyboardVisible ? "pb-2" : ""
                } ${isMobile ? "relative" : ""}`}
                style={{
                  backgroundColor: currentTheme.colors.chatBackground
                    ? `hsl(${currentTheme.colors.chatBackground})`
                    : undefined,
                  minHeight: isMobile ? "calc(100vh - 140px)" : undefined,
                }}
              >
                <div className="space-y-4">
                  {/* Load More Messages Button */}
                  {selectedContact && hasMoreMessages[selectedContact.id] && (
                    <div className="flex justify-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleLoadMoreMessages}
                        disabled={isLoadingMore}
                        className="text-xs"
                      >
                        {isLoadingMore ? (
                          <>
                            <motion.div
                              className="w-3 h-3 border-2 border-current border-t-transparent rounded-full mr-2"
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                            />
                            Loading...
                          </>
                        ) : (
                          <>
                            <ChevronUp className="h-3 w-3 mr-1" />
                            Load more messages
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  <AnimatePresence>
                    {currentMessages.map((message) => (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"} relative`}
                      >
                        {/* Swipe Reply Indicator - IMPROVED */}
                        {isMobile && swipeState.messageId === message.id && swipeState.isActive && (
                          <motion.div
                            className="absolute left-4 top-1/2 transform -translate-y-1/2 flex items-center space-x-2 text-primary z-10 pointer-events-none"
                            initial={{ opacity: 0, x: -30, scale: 0.8 }}
                            animate={{
                              opacity: getSwipeOpacity(message.id),
                              x: 0,
                              scale: getReplyIndicatorScale(message.id),
                            }}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                          >
                            <div className="bg-primary/20 backdrop-blur-sm rounded-full p-2">
                              <ReplyIcon className="h-5 w-5" />
                            </div>
                            <span className="text-sm font-medium bg-primary/20 backdrop-blur-sm px-2 py-1 rounded-full">
                              Reply
                            </span>
                          </motion.div>
                        )}

                        <div
                          className={`flex items-end space-x-2 ${message.sender === "user" ? "flex-row-reverse space-x-reverse" : ""}`}
                          style={{
                            transform: getSwipeTransform(message.id),
                            transition:
                              swipeState.isActive && swipeState.messageId === message.id
                                ? "none"
                                : "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                          }}
                        >
                          <motion.div
                            className={`max-w-xs rounded-lg px-4 py-2 ${getMessageBubbleStyle(
                              message.sender,
                              message.isDeleted,
                            )} ${message.isTemp ? "opacity-70" : ""} select-none`}
                            style={{
                              backgroundColor: message.isDeleted
                                ? currentTheme.colors.muted
                                  ? `hsl(${currentTheme.colors.muted})`
                                  : "hsl(var(--muted))"
                                : message.sender === "user"
                                  ? currentTheme.colors.messageSent
                                    ? `hsl(${currentTheme.colors.messageSent})`
                                    : "#ffffff"
                                  : currentTheme.colors.messageReceived
                                    ? `hsl(${currentTheme.colors.messageReceived})`
                                    : "#374151",
                              color: message.isDeleted
                                ? currentTheme.colors.mutedForeground
                                  ? `hsl(${currentTheme.colors.mutedForeground})`
                                  : "hsl(var(--muted-foreground))"
                                : message.sender === "user"
                                  ? currentTheme.colors.messageSentText
                                    ? `hsl(${currentTheme.colors.messageSentText})`
                                    : "#000000"
                                  : currentTheme.colors.messageReceivedText
                                    ? `hsl(${currentTheme.colors.messageReceivedText})`
                                    : "#ffffff",
                            }}
                            onContextMenu={!isMobile ? (e) => handleMessageContextMenu(e, message) : undefined}
                            onTouchStart={isMobile ? (e) => handleTouchStart(e, message) : undefined}
                            onTouchMove={isMobile ? (e) => handleTouchMove(e, message) : undefined}
                            onTouchEnd={isMobile ? (e) => handleTouchEnd(e, message) : undefined}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            {/* Group message sender name */}
                            {selectedGroup && message.sender === "contact" && (
                              <p className="text-xs font-medium mb-1 opacity-70">{message.senderName}</p>
                            )}

                            {/* Reply preview */}
                            {message.replyToId && message.replyToText && (
                              <div className="mb-2 p-2 rounded bg-black/10 dark:bg-white/10 border-l-2 border-current">
                                <p className="text-xs opacity-70 truncate">{message.replyToText}</p>
                              </div>
                            )}

                            {/* Message content */}
                            {message.isDeleted ? (
                              <p className="text-sm italic">This message was deleted</p>
                            ) : message.fileUrl ? (
                              <MessageFilePreview
                                fileUrl={message.fileUrl}
                                fileType={message.fileType || ""}
                                fileName={message.fileName || ""}
                              />
                            ) : (
                              <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>
                            )}

                            {/* Message reactions */}
                            {message.reactions && Object.keys(message.reactions).length > 0 && (
                              <MessageReactions
                                reactions={message.reactions}
                                onReactionClick={(emoji) => handleReactionClick(message.id, emoji)}
                                currentUserId={currentUser?.uid || ""}
                              />
                            )}

                            {/* Message timestamp and status */}
                            <div className="flex items-center justify-end space-x-1 mt-1">
                              <span className="text-xs opacity-60">{formatTime(message.timestamp)}</span>
                              {message.sender === "user" && (
                                <span className="text-xs opacity-60">
                                  {message.status === "sent" && "✓"}
                                  {message.status === "delivered" && "✓✓"}
                                  {message.status === "read" && "✓✓"}
                                </span>
                              )}
                            </div>
                          </motion.div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {/* Typing indicator */}
                  {selectedContact && typingUsers[selectedContact.id] && (
                    <div className="flex justify-start">
                      <TypingIndicator />
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Reply Preview */}
              <AnimatePresence>
                {replyingTo && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="reply-preview border-t border-border bg-muted/50 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">Replying to</p>
                        <p className="text-sm truncate">{replyingTo.text || "File"}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() => setReplyingTo(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Message Input */}
              <div
                ref={inputContainerRef}
                className={`border-t border-border bg-card p-4 transition-all duration-300 ${
                  isMobile && isKeyboardVisible ? "fixed bottom-0 left-0 right-0 z-50 shadow-lg" : ""
                }`}
              >
                <form onSubmit={handleSendMessage} className="flex items-end space-x-2">
                  <FileUpload onFileUpload={handleFileUpload} />
                  <div className="flex-1 relative">
                    <textarea
                      ref={messageInputRef}
                      value={newMessage}
                      onChange={handleInputChange}
                      placeholder="Type a message..."
                      className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent max-h-32 min-h-[40px]"
                      rows={1}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage(e)
                        }
                      }}
                      style={{
                        height: "auto",
                        minHeight: "40px",
                        maxHeight: "128px",
                      }}
                      onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement
                        target.style.height = "auto"
                        target.style.height = `${Math.min(target.scrollHeight, 128)}px`
                      }}
                    />
                  </div>
                  <Button
                    type="submit"
                    size="icon"
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    disabled={(!newMessage.trim() && !replyingTo) || isSending}
                  >
                    {isSending ? (
                      <motion.div
                        className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                      />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center bg-muted/20">
              <div className="text-center">
                <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground">Welcome to Chit Chat</h3>
                <p className="text-muted-foreground">Select a contact or group to start messaging</p>
              </div>
            </div>
          )}
        </div>

        {/* Context Menus */}
        <MessageContextMenu
          visible={contextMenu.visible}
          x={contextMenu.x}
          y={contextMenu.y}
          message={contextMenu.message}
          onClose={() => setContextMenu({ visible: false, x: 0, y: 0, message: null })}
          onReply={handleMessageAction}
          onCopy={handleCopyMessage}
          onDelete={handleDeleteMessage}
          onReaction={handleReaction}
          currentUserId={currentUser?.uid || ""}
          canDelete={true}
        />

        <ChatContextMenu
          visible={chatContextMenu.visible}
          x={chatContextMenu.x}
          y={chatContextMenu.y}
          contact={chatContextMenu.contact}
          group={chatContextMenu.group}
          onClose={() => setChatContextMenu({ visible: false, x: 0, y: 0, contact: null, group: null })}
          onPin={handlePinChat}
          onDelete={handleDeleteChat}
          onArchive={handleArchiveChat}
          onMarkAsRead={handleMarkAsRead}
          isPinned={(chatId) => pinnedChats.has(chatId)}
          isArchived={(chatId) => archivedChats.has(chatId)}
        />

        {/* Modals and Drawers */}
        <Dialog open={showAddContact} onOpenChange={setShowAddContact}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Contact</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddContact} className="space-y-4">
              <Input
                type="email"
                placeholder="Enter email address"
                value={newContactEmail}
                onChange={(e) => setNewContactEmail(e.target.value)}
                required
              />
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setShowAddContact(false)}>
                  Cancel
                </Button>
                <Button type="submit">Add Contact</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <ContactProfileDrawer
          isOpen={showContactProfile}
          onClose={() => setShowContactProfile(false)}
          contact={selectedContact}
        />

        <UserProfileDrawer isOpen={showUserProfile} onClose={() => setShowUserProfile(false)} />

        <GroupCreationModal
          isOpen={showGroupCreation}
          onClose={() => setShowGroupCreation(false)}
          contacts={contacts}
          currentUser={currentUser}
        />

        <GroupProfileDrawer
          isOpen={showGroupProfile}
          onClose={() => setShowGroupProfile(false)}
          group={selectedGroup}
          currentUser={currentUser}
        />
      </div>
    </DragDropZone>
  )
}
