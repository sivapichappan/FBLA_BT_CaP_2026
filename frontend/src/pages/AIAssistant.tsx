import { useState, useRef, useEffect } from 'react';
import { useLocation } from '../contexts/LocationContext';
import { aiApi } from '../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageCircle, Send, Bot, User } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggestions?: Array<{ id: number; name: string; category: string; rating: string }>;
}

const AIAssistant = () => {
  const { location } = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const res = await aiApi.chat(
        userMsg,
        location?.latitude,
        location?.longitude,
        sessionToken || undefined,
      );
      setSessionToken(res.data.sessionToken);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: res.data.response,
          suggestions: res.data.suggestions,
        },
      ]);
    } catch (error) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <MessageCircle className="h-7 w-7 text-primary" />
        <h1 className="text-3xl font-bold">AI Assistant</h1>
      </div>

      <Card className="flex flex-col h-[calc(100vh-16rem)]">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Bot className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
              <h2 className="text-lg font-semibold mb-2">How can I help?</h2>
              <p className="text-sm">Ask me about local businesses, restaurants, services, or anything nearby.</p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {['Best coffee near me', 'Affordable restaurants', 'Dog-friendly places'].map(q => (
                  <Button key={q} variant="outline" size="sm" onClick={() => { setInput(q); }}>
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4 w-4" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {msg.suggestions.map(s => (
                      <a
                        key={s.id}
                        href={`/business/${s.id}`}
                        className="text-xs bg-background/50 rounded px-2 py-1 hover:bg-background transition-colors"
                      >
                        {s.name} ({s.rating})
                      </a>
                    ))}
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bot className="h-4 w-4" />
              </div>
              <Skeleton className="h-12 w-48 rounded-lg" />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t p-4">
          <form onSubmit={e => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about local businesses..."
              disabled={loading}
              className="flex-1"
            />
            <Button type="submit" disabled={loading || !input.trim()} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </form>
          {!location && (
            <p className="text-xs text-muted-foreground mt-2">
              Enable location for better recommendations.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
};

export default AIAssistant;
