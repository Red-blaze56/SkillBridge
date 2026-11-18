import { useCallback, useEffect, useRef, useState } from 'react'

// Web Speech API wrappers. Two concerns, one file:
//   useSpeak     -> text-to-speech (speak the interviewer's questions)
//   useDictation -> speech-to-text (voice answers)
// Both degrade to `supported: false` where the browser lacks the API (Firefox/Safari).
// STT lives behind this hook on purpose: swapping to a /transcribe endpoint
// (Groq-Whisper, Sarvam) later means changing only this file, not the UI.

const hasWindow = typeof window !== 'undefined'

export function useSpeak() {
  const supported = hasWindow && 'speechSynthesis' in window
  const [speaking, setSpeaking] = useState(false)

  const speak = useCallback(
    (text: string) => {
      if (!supported) return
      const clean = text.trim()
      if (!clean) return
      window.speechSynthesis.cancel() // never let two questions overlap
      const utterance = new SpeechSynthesisUtterance(clean)
      utterance.rate = 1
      utterance.pitch = 1
      utterance.onstart = () => setSpeaking(true)
      utterance.onend = () => setSpeaking(false)
      utterance.onerror = () => setSpeaking(false)
      window.speechSynthesis.speak(utterance)
    },
    [supported],
  )

  const cancel = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [supported])

  // Don't keep talking after the screen unmounts.
  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel()
    }
  }, [supported])

  return { speak, cancel, speaking, supported }
}

interface DictationOptions {
  // The running transcript for the current session (finalised words + live interim).
  onTranscript: (text: string) => void
  lang?: string
}

export function useDictation({ onTranscript, lang = 'en-IN' }: DictationOptions) {
  const Recognition = hasWindow ? (window.SpeechRecognition ?? window.webkitSpeechRecognition) : undefined
  const supported = !!Recognition
  const [listening, setListening] = useState(false)

  const recRef = useRef<SpeechRecognition | null>(null)
  const finalRef = useRef('') // words the engine has committed this session
  // Hold the latest callback so a re-render never has to restart recognition.
  const onTranscriptRef = useRef(onTranscript)
  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  const start = useCallback(() => {
    if (!Recognition || recRef.current) return
    const rec = new Recognition()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    finalRef.current = ''

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript
        if (result.isFinal) finalRef.current += text
        else interim += text
      }
      onTranscriptRef.current((finalRef.current + interim).trim())
    }
    const end = () => {
      setListening(false)
      recRef.current = null
    }
    rec.onend = end
    rec.onerror = end

    recRef.current = rec
    rec.start()
    setListening(true)
  }, [Recognition, lang])

  const stop = useCallback(() => {
    recRef.current?.stop()
  }, [])

  // Abort cleanly if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      recRef.current?.abort()
      recRef.current = null
    }
  }, [])

  return { start, stop, listening, supported }
}
