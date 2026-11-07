// The backend labels topics in snake_case ("operating_systems"). "general" is the
// label it uses for the opening icebreaker.
export function topicLabel(topic: string): string {
  if (topic === 'general') return 'Warm-up'
  const words = topic.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
