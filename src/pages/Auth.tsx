import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";

const Auth = () => {
  const { user, signIn, signUp, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showSignInPwd, setShowSignInPwd] = useState(false);
  const [showSignUpPwd, setShowSignUpPwd] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) toast.error(error);
    else { toast.success("Welcome back!"); navigate("/"); }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setBusy(true);
    const { error } = await signUp(email, password, fullName);
    setBusy(false);
    if (error) toast.error(error);
    else { toast.success("Account created! You're signed in."); navigate("/"); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[image:var(--gradient-primary)]">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 text-primary-foreground">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-white/15 backdrop-blur items-center justify-center mb-3 font-display text-2xl font-bold">V</div>
          <h1 className="font-display text-3xl font-bold">VyaparBook</h1>
          <p className="text-sm opacity-90 mt-1">GST billing, inventory & accounting — built for Indian shops.</p>
        </div>
        <Card className="p-5 rounded-2xl shadow-[var(--shadow-pop)]">
          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Create Account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-3 mt-3">
                <div>
                  <Label htmlFor="si-email">Email</Label>
                  <Input id="si-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="h-12" />
                </div>
                <div>
                  <Label htmlFor="si-pwd">Password</Label>
                  <div className="relative">
                    <Input id="si-pwd" type={showSignInPwd ? "text" : "password"} required value={password} onChange={e => setPassword(e.target.value)} className="h-12 pr-12" />
                    <button type="button" onClick={() => setShowSignInPwd(s => !s)} aria-label={showSignInPwd ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showSignInPwd ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" disabled={busy} className="w-full h-12 text-base font-semibold">
                  {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Sign In
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-3 mt-3">
                <div>
                  <Label htmlFor="su-name">Your Name</Label>
                  <Input id="su-name" required value={fullName} onChange={e => setFullName(e.target.value)} className="h-12" />
                </div>
                <div>
                  <Label htmlFor="su-email">Email</Label>
                  <Input id="su-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="h-12" />
                </div>
                <div>
                  <Label htmlFor="su-pwd">Password (min 6 chars)</Label>
                  <div className="relative">
                    <Input id="su-pwd" type={showSignUpPwd ? "text" : "password"} required minLength={6} value={password} onChange={e => setPassword(e.target.value)} className="h-12 pr-12" />
                    <button type="button" onClick={() => setShowSignUpPwd(s => !s)} aria-label={showSignUpPwd ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showSignUpPwd ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" disabled={busy} className="w-full h-12 text-base font-semibold">
                  {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Create Account
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
        <p className="text-xs text-center text-primary-foreground/80 mt-4">
          No email confirmation needed — you're signed in instantly as Admin.
        </p>
      </div>
    </div>
  );
};

export default Auth;
