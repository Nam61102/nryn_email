import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors } from '../lib/theme';

export type TabKey = 'inbox' | 'calendar' | 'profile' | 'workspace' | 'home' | 'nryn' | 'actions';

interface BottomNavProps {
  activeTab?: TabKey;
}

export function BottomNav({ activeTab = 'inbox' }: BottomNavProps) {
  const currentTab = activeTab === 'calendar' ? 'calendar' : activeTab === 'profile' ? 'profile' : 'inbox';

  return (
    <View style={s.container}>
      <Pressable
        style={s.tab}
        onPress={() => router.replace('/inbox')}
        accessibilityRole="button"
        accessibilityLabel="Inbox"
      >
        <Ionicons
          name={currentTab === 'inbox' ? 'mail' : 'mail-outline'}
          size={22}
          color={currentTab === 'inbox' ? colors.primary : colors.textFaint}
        />
        <Text style={[s.label, currentTab === 'inbox' && s.activeLabel]}>Inbox</Text>
      </Pressable>

      <Pressable
        style={s.tab}
        onPress={() => router.replace('/calendar')}
        accessibilityRole="button"
        accessibilityLabel="Calender"
      >
        <Ionicons
          name={currentTab === 'calendar' ? 'calendar' : 'calendar-outline'}
          size={22}
          color={currentTab === 'calendar' ? colors.primary : colors.textFaint}
        />
        <Text style={[s.label, currentTab === 'calendar' && s.activeLabel]}>Calender</Text>
      </Pressable>

      <Pressable
        style={s.tab}
        onPress={() => router.push('/account')}
        accessibilityRole="button"
        accessibilityLabel="Profile"
      >
        <Ionicons
          name={currentTab === 'profile' ? 'person' : 'person-outline'}
          size={22}
          color={currentTab === 'profile' ? colors.primary : colors.textFaint}
        />
        <Text style={[s.label, currentTab === 'profile' && s.activeLabel]}>Profile</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    paddingVertical: 10,
    paddingBottom: 16,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textFaint,
  },
  activeLabel: {
    color: colors.primary,
    fontWeight: '700',
  },
});
