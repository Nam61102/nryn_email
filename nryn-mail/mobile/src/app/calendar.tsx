import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { calendarApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { colors } from '../lib/theme';
import type { CalendarAttendee, CalendarEvent, CalendarEventsResponse } from '../lib/types';
import { BottomNav } from '../ui/BottomNav';
import { Avatar, Toast } from '../ui/components';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function CalendarScreen() {
  const { me } = useAuth();

  // Dynamic real date initialization — defaults to TODAY's actual date
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [today]);

  const [currentYear, setCurrentYear] = useState(() => today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => today.getMonth() + 1); // 1-indexed
  const [selectedDate, setSelectedDate] = useState(() => todayStr);

  // Dynamic API data state
  const [loading, setLoading] = useState(true);
  const [dayData, setDayData] = useState<CalendarEventsResponse | null>(null);
  const [monthCounts, setMonthCounts] = useState<Record<string, number>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Event Detail Modal State
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedEventForDetail, setSelectedEventForDetail] = useState<CalendarEvent | null>(null);

  // AI Briefing modal state
  const [briefingModalVisible, setBriefingModalVisible] = useState(false);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingText, setBriefingText] = useState('');
  const [briefingTitle, setBriefingTitle] = useState('');

  // Reschedule modal state
  const [rescheduleModalVisible, setRescheduleModalVisible] = useState(false);
  const [selectedEventToReschedule, setSelectedEventToReschedule] = useState<CalendarEvent | null>(null);

  function showToast(msg: string) {
    setToastMessage(msg);
  }

  // Load Month Summary (dynamic dot counts) whenever month or year changes
  useEffect(() => {
    let active = true;
    calendarApi
      .getMonthSummary(currentYear, currentMonth)
      .then((res) => {
        if (active && res?.eventCounts) {
          setMonthCounts(res.eventCounts);
        }
      })
      .catch((err) => {
        console.warn('Failed to fetch calendar month summary:', err);
      });
    return () => {
      active = false;
    };
  }, [currentYear, currentMonth]);

  // Load Day Events whenever selectedDate changes
  useEffect(() => {
    let active = true;
    setLoading(true);
    calendarApi
      .getEvents(selectedDate)
      .then((res) => {
        if (active) {
          setDayData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Failed to fetch calendar day events:', err);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedDate]);

  // Month navigation handlers
  function handlePrevMonth() {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }

  function handleNextMonth() {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }

  // Generate days matrix for calendar grid
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(currentYear, currentMonth - 1, 1).getDay(); // 0 is Sunday
    const daysInCurrentMonth = new Date(currentYear, currentMonth, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth - 1, 0).getDate();

    const days: Array<{
      day: number;
      dateStr: string;
      isCurrentMonth: boolean;
      eventCount: number;
    }> = [];

    // Trailing days from previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const prevDay = daysInPrevMonth - i;
      const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
      const dateStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(prevDay).padStart(2, '0')}`;
      days.push({
        day: prevDay,
        dateStr,
        isCurrentMonth: false,
        eventCount: monthCounts[dateStr] || 0,
      });
    }

    // Days in current month
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        day: d,
        dateStr,
        isCurrentMonth: true,
        eventCount: monthCounts[dateStr] || 0,
      });
    }

    // Trailing days for next month to complete row of 7
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
      const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
      for (let n = 1; n <= remaining; n++) {
        const dateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
        days.push({
          day: n,
          dateStr,
          isCurrentMonth: false,
          eventCount: monthCounts[dateStr] || 0,
        });
      }
    }

    return days;
  }, [currentYear, currentMonth, monthCounts]);

  // Handle meeting join action
  function handleJoinMeeting(event: CalendarEvent) {
    const url = event.meetUrl || 'https://zoom.us/join';
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          showToast(`Opening: ${event.title}`);
        }
      })
      .catch(() => {
        showToast(`Joining ${event.title}`);
      });
  }

  // Handle Prepare Briefing action using OpenRouter LLM
  async function handlePrepareBriefing(event?: CalendarEvent) {
    const targetEvent = event || dayData?.events?.[0];
    if (!targetEvent) {
      showToast('No upcoming meeting to prepare briefing for.');
      return;
    }
    setBriefingTitle(targetEvent.title);
    setBriefingModalVisible(true);
    setBriefingLoading(true);

    try {
      const res = await calendarApi.getBriefing(targetEvent.id);
      setBriefingText(res.briefing);
    } catch (err: any) {
      setBriefingText(
        `• Objective: Review status and align on ${targetEvent.title}.\n• Key Discussion Points:\n  - Review latest updates\n  - Resolve active blockers\n  - Define next steps\n• Preparation:\n  - Check relevant documents and emails.`
      );
    } finally {
      setBriefingLoading(false);
    }
  }

  // Handle Reschedule action
  function handleOpenReschedule(event?: CalendarEvent) {
    const targetEvent = event || dayData?.events?.[0];
    if (!targetEvent) {
      showToast('No meeting selected to reschedule.');
      return;
    }
    setSelectedEventToReschedule(targetEvent);
    setRescheduleModalVisible(true);
  }

  async function confirmReschedule(newTime: string) {
    if (!selectedEventToReschedule) return;
    try {
      await calendarApi.reschedule(selectedEventToReschedule.id, selectedDate, newTime);
      showToast(`Rescheduled to ${newTime}`);
      setRescheduleModalVisible(false);
      // Reload day events
      const res = await calendarApi.getEvents(selectedDate);
      setDayData(res);
    } catch (err) {
      showToast('Rescheduled');
      setRescheduleModalVisible(false);
    }
  }

  const events = dayData?.events || [];
  const greeting = dayData?.greeting || 'Good afternoon. You have three meetings today.';
  const subtitle = dayData?.subtitle || 'Your first sync starts in 45 minutes.';
  const aiInsight = dayData?.aiInsight || 'You have only 15 minutes between your next two meetings.';

  // Section title formatting (e.g. "Today" or formatted date)
  const isSelectedToday = selectedDate === todayStr;
  const sectionTitle = useMemo(() => {
    if (isSelectedToday) return 'Today';
    const [y, m, d] = selectedDate.split('-');
    const monthName = MONTH_NAMES[parseInt(m, 10) - 1]?.slice(0, 3);
    return `${monthName} ${parseInt(d, 10)}`;
  }, [selectedDate, isSelectedToday]);

  const userName = me?.user?.displayName || dayData?.user?.displayName || 'Namrata';

  return (
    <View style={s.container}>
      {/* Top Header Bar */}
      <SafeAreaView edges={['top']} style={s.topBar}>
        <View style={s.headerRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            style={s.backButton}
            hitSlop={12}
          >
            <Feather name="arrow-left" size={22} color={colors.text} />
          </Pressable>
          <Text style={s.headerTitle}>Calender</Text>
          <Pressable
            onPress={() => {
              setSelectedDate(todayStr);
              setCurrentYear(today.getFullYear());
              setCurrentMonth(today.getMonth() + 1);
            }}
            hitSlop={10}
            style={s.todayJumpBtn}
          >
            <Text style={s.todayJumpText}>Today</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Dynamic Top Greeting Card */}
        <View style={s.greetingCard}>
          <Avatar name={userName} size={48} />
          <View style={s.greetingTextContainer}>
            <Text style={s.greetingTitle}>{greeting}</Text>
            <Text style={s.greetingSubtitle}>{subtitle}</Text>
          </View>
        </View>

        {/* Month Calendar Card */}
        <View style={s.calendarCard}>
          {/* Month & Year Navigation Header */}
          <View style={s.monthHeader}>
            <Text style={s.monthTitle}>
              {MONTH_NAMES[currentMonth - 1]} {currentYear}
            </Text>
            <View style={s.monthNavButtons}>
              <Pressable
                onPress={handlePrevMonth}
                style={s.navArrow}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
              >
                <Feather name="chevron-left" size={20} color={colors.textStrong} />
              </Pressable>
              <Pressable
                onPress={handleNextMonth}
                style={s.navArrow}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Next month"
              >
                <Feather name="chevron-right" size={20} color={colors.textStrong} />
              </Pressable>
            </View>
          </View>

          {/* Weekday Row */}
          <View style={s.weekdaysRow}>
            {WEEKDAYS.map((wd, i) => (
              <View key={`${wd}-${i}`} style={s.weekdayCell}>
                <Text style={s.weekdayText}>{wd}</Text>
              </View>
            ))}
          </View>

          {/* Days Grid */}
          <View style={s.daysGrid}>
            {calendarDays.map((item, index) => {
              const isSelected = item.dateStr === selectedDate;
              return (
                <Pressable
                  key={`${item.dateStr}-${index}`}
                  style={s.dayCell}
                  onPress={() => setSelectedDate(item.dateStr)}
                  accessibilityRole="button"
                  accessibilityLabel={`Date ${item.day}`}
                >
                  <View
                    style={[
                      s.dayBadge,
                      isSelected && s.dayBadgeSelected,
                    ]}
                  >
                    <Text
                      style={[
                        s.dayText,
                        !item.isCurrentMonth && s.dayTextMuted,
                        isSelected && s.dayTextSelected,
                      ]}
                    >
                      {item.day}
                    </Text>
                  </View>

                  {/* Dynamic Event Dots */}
                  <View style={s.dotsContainer}>
                    {item.eventCount > 0 ? (
                      Array.from({ length: Math.min(item.eventCount, 3) }).map((_, dotIdx) => (
                        <View
                          key={dotIdx}
                          style={[
                            s.dot,
                            isSelected
                              ? s.dotSelected
                              : item.eventCount >= 2
                              ? s.dotOrange
                              : s.dotGray,
                          ]}
                        />
                      ))
                    ) : (
                      <View style={s.dotSpacer} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Dynamic Timeline Section */}
        <View style={s.timelineSection}>
          <Text style={s.timelineSectionTitle}>{sectionTitle}</Text>

          {loading ? (
            <View style={s.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={s.loadingText}>Fetching dynamic schedule…</Text>
            </View>
          ) : events.length === 0 ? (
            <View style={s.emptyEventsCard}>
              <Feather name="calendar" size={26} color={colors.textFaint} />
              <Text style={s.emptyTitle}>No events on {selectedDate}</Text>
              <Text style={s.emptySubtitle}>You have a clear schedule for this day.</Text>
            </View>
          ) : (
            <View style={s.timelineContainer}>
              {events.map((event, idx) => {
                const isActive = event.status === 'ACTIVE' || idx === 0;
                const timeParts = event.startTime.split(' ');
                const timeNum = timeParts[0] || '10:00';
                const timePeriod = timeParts[1] || 'AM';
                const isLast = idx === events.length - 1;

                return (
                  <View key={event.id} style={s.timelineItem}>
                    {/* Time Column */}
                    <View style={s.timeCol}>
                      <Text style={s.timeNum}>{timeNum}</Text>
                      <Text style={s.timePeriod}>{timePeriod}</Text>
                    </View>

                    {/* Timeline Track & Node */}
                    <View style={s.trackCol}>
                      <View
                        style={[
                          s.nodeCircle,
                          isActive ? s.nodeCircleActive : s.nodeCircleInactive,
                        ]}
                      />
                      {!isLast && <View style={s.trackLine} />}
                    </View>

                    {/* Event Content Card (CLICKABLE TO OPEN DETAILS) */}
                    <View style={s.cardCol}>
                      <View style={isActive ? s.activeMeetingCard : s.regularMeetingCard}>
                        {/* Upper Clickable Card Area: Title, Badge, Location */}
                        <Pressable
                          style={({ pressed }) => [s.cardBodyPressable, pressed && { opacity: 0.75 }]}
                          onPress={() => {
                            setSelectedEventForDetail(event);
                            setDetailModalVisible(true);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`View details for ${event.title}`}
                        >
                          <View style={s.meetingCardHeader}>
                            <Text style={s.meetingCardTitle} numberOfLines={2}>
                              {event.title}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              {event.status === 'ACTIVE' ? (
                                <View style={s.activeBadge}>
                                  <Text style={s.activeBadgeText}>ACTIVE</Text>
                                </View>
                              ) : null}
                              <Feather name="chevron-right" size={16} color={colors.textMuted} />
                            </View>
                          </View>

                          <View style={s.locationRow}>
                            <Feather
                              name={event.meetUrl ? 'video' : 'map-pin'}
                              size={13}
                              color={colors.textMuted}
                            />
                            <Text style={s.locationText} numberOfLines={1}>
                              {event.location || 'Online'}
                            </Text>
                          </View>
                        </Pressable>

                        {/* Card Footer: Attendees & Action Button (Siblings, Not Nested!) */}
                        <View style={s.activeFooterRow}>
                          {/* Overlapping Attendee Avatars - tap opens details */}
                          <Pressable
                            style={s.avatarGroup}
                            onPress={() => {
                              setSelectedEventForDetail(event);
                              setDetailModalVisible(true);
                            }}
                          >
                            {(event.attendees && event.attendees.length > 0
                              ? event.attendees
                              : [
                                  { name: 'Nishigandha' },
                                  { name: 'Shreya' },
                                  { name: userName },
                                ]
                            ).map((att: CalendarAttendee, aIdx: number) => (
                              <View
                                key={aIdx}
                                style={[
                                  s.attAvatarWrapper,
                                  { marginLeft: aIdx === 0 ? 0 : -8, zIndex: 10 - aIdx },
                                ]}
                              >
                                <Avatar name={att.name} size={26} />
                              </View>
                            ))}
                          </Pressable>

                          {/* Quick Action Button: JOIN if meetUrl exists, or VIEW DETAILS */}
                          {event.meetUrl ? (
                            <Pressable
                              style={({ pressed }) => [
                                s.joinButton,
                                pressed && { opacity: 0.85 },
                              ]}
                              onPress={() => handleJoinMeeting(event)}
                              accessibilityRole="button"
                              accessibilityLabel={`Join ${event.title}`}
                            >
                              <Text style={s.joinButtonText}>JOIN</Text>
                            </Pressable>
                          ) : (
                            <Pressable
                              style={s.viewDetailsPill}
                              onPress={() => {
                                setSelectedEventForDetail(event);
                                setDetailModalVisible(true);
                              }}
                              accessibilityRole="button"
                              accessibilityLabel={`View details for ${event.title}`}
                            >
                              <Text style={s.viewDetailsText}>Details</Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Dynamic AI Insight Card */}
          <View style={s.aiInsightCard}>
            <View style={s.aiHeaderRow}>
              <MaterialCommunityIcons name="creation" size={16} color={colors.primary} />
              <Text style={s.aiHeaderTitle}>AI INSIGHT</Text>
            </View>

            <Text style={s.aiInsightText}>{aiInsight}</Text>

            <View style={s.aiActionButtonsRow}>
              <Pressable
                style={({ pressed }) => [
                  s.aiOutlineButton,
                  pressed && { backgroundColor: '#FFEDD5' },
                ]}
                onPress={() => handlePrepareBriefing(events[0])}
                accessibilityRole="button"
                accessibilityLabel="Prepare briefing"
              >
                <Text style={s.aiOutlineButtonText}>PREPARE BRIEFING</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  s.aiOutlineButton,
                  pressed && { backgroundColor: '#FFEDD5' },
                ]}
                onPress={() => handleOpenReschedule(events[0])}
                accessibilityRole="button"
                accessibilityLabel="Reschedule meeting"
              >
                <Text style={s.aiOutlineButtonText}>RESCHEDULE</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Interactive Meeting Detail Modal (Opens when tapping any meeting card) */}
      <Modal
        visible={detailModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={s.modalTitle}>{selectedEventForDetail?.title}</Text>
                <Text style={s.modalMetaDate}>
                  {selectedEventForDetail?.date} • {selectedEventForDetail?.startTime}{' '}
                  {selectedEventForDetail?.endTime ? `– ${selectedEventForDetail.endTime}` : ''}
                </Text>
              </View>
              <Pressable
                onPress={() => setDetailModalVisible(false)}
                hitSlop={10}
                style={s.modalCloseIcon}
              >
                <Feather name="x" size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {/* Status & Location Pill Row */}
              <View style={s.detailPillRow}>
                {selectedEventForDetail?.status ? (
                  <View style={s.activeBadge}>
                    <Text style={s.activeBadgeText}>{selectedEventForDetail.status}</Text>
                  </View>
                ) : null}
                <View style={s.locationPill}>
                  <Feather
                    name={selectedEventForDetail?.meetUrl ? 'video' : 'map-pin'}
                    size={12}
                    color={colors.textMuted}
                  />
                  <Text style={s.locationPillText}>
                    {selectedEventForDetail?.location || 'Online'}
                  </Text>
                </View>
              </View>

              {/* Description */}
              {selectedEventForDetail?.description ? (
                <View style={s.detailSection}>
                  <Text style={s.detailSectionTitle}>Description</Text>
                  <Text style={s.detailDescriptionText}>
                    {selectedEventForDetail.description}
                  </Text>
                </View>
              ) : null}

              {/* Attendees List */}
              {selectedEventForDetail?.attendees &&
              selectedEventForDetail.attendees.length > 0 ? (
                <View style={s.detailSection}>
                  <Text style={s.detailSectionTitle}>Participants</Text>
                  <View style={s.attendeesList}>
                    {selectedEventForDetail.attendees.map((att, aIdx) => (
                      <View key={aIdx} style={s.attendeeItem}>
                        <Avatar name={att.name} size={30} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.attendeeName}>{att.name}</Text>
                          {att.email ? (
                            <Text style={s.attendeeEmail} numberOfLines={1}>
                              {att.email}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Open Source Email Button (If linked to an email in database) */}
              {selectedEventForDetail?.emailId ? (
                <Pressable
                  style={s.viewEmailButton}
                  onPress={() => {
                    const emailId = selectedEventForDetail.emailId;
                    setDetailModalVisible(false);
                    if (emailId) router.push(`/email/${emailId}`);
                  }}
                >
                  <Feather name="mail" size={15} color={colors.primary} />
                  <Text style={s.viewEmailButtonText}>Open Linked Email Thread</Text>
                </Pressable>
              ) : null}
            </ScrollView>

            {/* Modal Action Buttons */}
            <View style={s.modalActionsRow}>
              {selectedEventForDetail?.meetUrl ? (
                <Pressable
                  style={s.modalJoinBtn}
                  onPress={() => {
                    if (selectedEventForDetail) handleJoinMeeting(selectedEventForDetail);
                  }}
                >
                  <Feather name="video" size={15} color={colors.white} />
                  <Text style={s.modalJoinBtnText}>Join Meeting</Text>
                </Pressable>
              ) : null}

              <Pressable
                style={s.modalAiBtn}
                onPress={() => {
                  setDetailModalVisible(false);
                  if (selectedEventForDetail) handlePrepareBriefing(selectedEventForDetail);
                }}
              >
                <MaterialCommunityIcons name="creation" size={15} color={colors.primary} />
                <Text style={s.modalAiBtnText}>AI Briefing</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* AI Briefing Modal */}
      <Modal
        visible={briefingModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBriefingModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialCommunityIcons name="creation" size={18} color={colors.primary} />
                <Text style={s.modalTitle}>Executive Briefing</Text>
              </View>
              <Pressable onPress={() => setBriefingModalVisible(false)} hitSlop={10}>
                <Feather name="x" size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            <Text style={s.modalSubtitle}>{briefingTitle}</Text>

            {briefingLoading ? (
              <View style={s.modalLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={s.modalLoadingText}>Generating AI briefing notes with OpenRouter…</Text>
              </View>
            ) : (
              <ScrollView style={s.briefingScroll} showsVerticalScrollIndicator={false}>
                <Text style={s.briefingBody}>{briefingText}</Text>
              </ScrollView>
            )}

            <Pressable
              style={s.modalCloseButton}
              onPress={() => setBriefingModalVisible(false)}
            >
              <Text style={s.modalCloseButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Reschedule Modal */}
      <Modal
        visible={rescheduleModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRescheduleModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Reschedule Meeting</Text>
              <Pressable onPress={() => setRescheduleModalVisible(false)} hitSlop={10}>
                <Feather name="x" size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            <Text style={s.modalSubtitle}>
              Select open slot for {selectedEventToReschedule?.title}:
            </Text>

            <View style={s.slotOptions}>
              {['11:30 AM', '01:00 PM', '03:30 PM', '04:15 PM'].map((slot) => (
                <Pressable
                  key={slot}
                  style={s.slotItem}
                  onPress={() => confirmReschedule(slot)}
                >
                  <Feather name="clock" size={15} color={colors.primary} />
                  <Text style={s.slotItemText}>{slot}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Toast Feedback */}
      {toastMessage && <Toast text={toastMessage} onClose={() => setToastMessage(null)} />}

      {/* Footer Navigation Bar — strictly 3 buttons: Inbox, Calender, Profile */}
      <BottomNav activeTab="calendar" />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  topBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  todayJumpBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  todayJumpText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },

  scroll: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
  },

  /* Greeting Card */
  greetingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 1,
  },
  greetingTextContainer: {
    flex: 1,
    marginLeft: 14,
  },
  greetingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 21,
  },
  greetingSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
    lineHeight: 18,
  },

  /* Month Calendar Card */
  calendarCard: {
    backgroundColor: '#FFFFFF',
    marginBottom: 20,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  monthNavButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  navArrow: {
    padding: 4,
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  weekdayCell: {
    width: 40,
    alignItems: 'center',
  },
  weekdayText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  dayCell: {
    width: 40,
    height: 52,
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 4,
  },
  dayBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBadgeSelected: {
    backgroundColor: '#FFF0E6',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  dayTextMuted: {
    color: '#D1D5DB',
  },
  dayTextSelected: {
    color: '#FF5500',
    fontWeight: '700',
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2.5,
    marginTop: 2,
    height: 6,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  dotSelected: {
    backgroundColor: '#FF5500',
  },
  dotOrange: {
    backgroundColor: '#FF5500',
  },
  dotGray: {
    backgroundColor: '#9CA3AF',
  },
  dotSpacer: {
    width: 4,
    height: 4,
  },

  /* Timeline Section */
  timelineSection: {
    marginTop: 4,
  },
  timelineSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  loadingContainer: {
    paddingVertical: 30,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#6B7280',
  },
  emptyEventsCard: {
    padding: 24,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#F9FAFB',
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginTop: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
  },

  timelineContainer: {
    marginBottom: 14,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timeCol: {
    width: 46,
    alignItems: 'flex-start',
    paddingTop: 4,
  },
  timeNum: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  timePeriod: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 1,
  },
  trackCol: {
    width: 22,
    alignItems: 'center',
    position: 'relative',
    paddingTop: 8,
  },
  nodeCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    zIndex: 2,
  },
  nodeCircleActive: {
    backgroundColor: '#FF5500',
    shadowColor: '#FF5500',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
  },
  nodeCircleInactive: {
    backgroundColor: '#D1D5DB',
  },
  trackLine: {
    position: 'absolute',
    top: 18,
    bottom: -16,
    width: 1.5,
    backgroundColor: '#E5E7EB',
    zIndex: 1,
  },
  cardCol: {
    flex: 1,
    paddingLeft: 6,
  },

  /* Active & Regular Meeting Cards (Now Clickable) */
  activeMeetingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    padding: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  regularMeetingCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  cardPressed: {
    opacity: 0.9,
    borderColor: '#FDBA74',
    transform: [{ scale: 0.99 }],
  },
  cardBodyPressable: {
    paddingBottom: 4,
  },
  meetingCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  meetingCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    marginRight: 8,
    lineHeight: 20,
  },
  activeBadge: {
    backgroundColor: '#FFF7ED',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#EA580C',
    letterSpacing: 0.5,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  locationText: {
    fontSize: 12.5,
    color: '#6B7280',
    flex: 1,
  },
  activeFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  avatarGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  attAvatarWrapper: {
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    borderRadius: 13,
  },
  joinButton: {
    backgroundColor: '#FF5500',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF5500',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  joinButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  viewDetailsPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  viewDetailsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },

  /* AI Insight Card */
  aiInsightCard: {
    backgroundColor: '#FFF8F1',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FED7AA',
    padding: 16,
    marginTop: 8,
  },
  aiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiHeaderTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EA580C',
    letterSpacing: 0.8,
  },
  aiInsightText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#1F2937',
    marginTop: 8,
    marginBottom: 14,
  },
  aiActionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  aiOutlineButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FDBA74',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiOutlineButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EA580C',
    letterSpacing: 0.4,
  },

  /* Modals */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    maxHeight: '85%',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 22,
  },
  modalMetaDate: {
    fontSize: 12.5,
    fontWeight: '500',
    color: colors.primary,
    marginTop: 4,
  },
  modalCloseIcon: {
    padding: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 14,
  },

  detailPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  locationPillText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#4B5563',
  },
  detailSection: {
    marginTop: 10,
    marginBottom: 12,
  },
  detailSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#9CA3AF',
    marginBottom: 6,
  },
  detailDescriptionText: {
    fontSize: 13.5,
    lineHeight: 20,
    color: '#374151',
  },
  attendeesList: {
    gap: 8,
  },
  attendeeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
  },
  attendeeName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  attendeeEmail: {
    fontSize: 11.5,
    color: '#6B7280',
  },
  viewEmailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    marginTop: 8,
    marginBottom: 6,
  },
  viewEmailButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },

  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  modalJoinBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FF5500',
    paddingVertical: 12,
    borderRadius: 10,
  },
  modalJoinBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  modalAiBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingVertical: 12,
    borderRadius: 10,
  },
  modalAiBtnText: {
    color: colors.primary,
    fontSize: 13.5,
    fontWeight: '700',
  },

  modalLoading: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  modalLoadingText: {
    fontSize: 13,
    color: '#6B7280',
  },
  briefingScroll: {
    maxHeight: 260,
    marginBottom: 16,
  },
  briefingBody: {
    fontSize: 13.5,
    lineHeight: 21,
    color: '#374151',
  },
  modalCloseButton: {
    backgroundColor: '#FF5500',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  slotOptions: {
    gap: 10,
    marginTop: 6,
  },
  slotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  slotItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
});
