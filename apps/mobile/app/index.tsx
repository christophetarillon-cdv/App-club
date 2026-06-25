import { Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useDancer } from '@/contexts/DancerContext';

export default function Index() {
  const { user } = useAuth();
  const { selectedDancer } = useDancer();

  if (!user) return <Redirect href="/(auth)/login" />;
  if (selectedDancer) return <Redirect href={`/dancer/${selectedDancer.id}`} />;
  return <Redirect href="/select-dancer" />;
}
