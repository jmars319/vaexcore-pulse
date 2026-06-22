import { StatusBar } from "expo-status-bar";
import { startTransition, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SurfaceCard } from "./components/SurfaceCard";
import { TabRail } from "./components/TabRail";
import {
  bandTone,
  companionSnapshot,
  mobileTabs,
  type MobileTab,
} from "./data/companion";

const pulseLogo = require("../assets/vaexcore-pulse-logo.png") as number;

/* Mobile shell boundary */
export default function App() {
  const [activeTab, setActiveTab] = useState<MobileTab>("dashboard");

  /* Companion tab boundary */
  function renderTabContent() {
    if (activeTab === "projects") {
      return (
        <View style={styles.sectionStack}>
          {companionSnapshot.projects.length === 0 ? (
            <SurfaceCard
              accent="cyan"
              eyebrow="Projects"
              title="No synced sessions yet"
            >
              <Text style={styles.bodyText}>
                Sessions from the desktop app will appear here when sync is
                available.
              </Text>
            </SurfaceCard>
          ) : null}
          {companionSnapshot.projects.map((project) => (
            <SurfaceCard
              accent="cyan"
              eyebrow={`Profile: ${project.profileLabel}`}
              key={project.sessionId}
              title={project.sessionTitle}
            >
              <Text style={styles.bodyText}>
                {project.candidateCount} moments tracked,{" "}
                {project.acceptedCount} accepted.
              </Text>
              <Text style={styles.mutedText}>{project.sourcePath}</Text>
              <Text style={styles.captionText}>
                Quick project browsing and status checks.
              </Text>
              <Text style={styles.metaText}>
                Updated {project.updatedLabel}
              </Text>
            </SurfaceCard>
          ))}
        </View>
      );
    }

    if (activeTab === "queue") {
      return (
        <View style={styles.sectionStack}>
          <SurfaceCard
            accent="magenta"
            eyebrow="Review Queue"
            title="Review queue"
          >
            <Text style={styles.bodyText}>
              Review queue items from desktop will appear here when sync is
              available.
            </Text>
          </SurfaceCard>

          {companionSnapshot.queue.length === 0 ? (
            <SurfaceCard
              accent="magenta"
              eyebrow="Review Queue"
              title="No queue items yet"
            >
              <Text style={styles.bodyText}>
                Start a scan in the desktop app to create review items.
              </Text>
            </SurfaceCard>
          ) : null}

          {companionSnapshot.queue.map((candidate) => {
            const tone = bandTone(candidate.confidenceBand);

            return (
              <SurfaceCard key={candidate.id} title={candidate.label}>
                <View style={styles.rowBetween}>
                  <Text style={styles.metaText}>{candidate.windowLabel}</Text>
                  <View
                    style={[
                      styles.bandChip,
                      { backgroundColor: tone.backgroundColor },
                    ]}
                  >
                    <Text
                      style={[styles.bandChipLabel, { color: tone.textColor }]}
                    >
                      {tone.label}
                    </Text>
                  </View>
                </View>
                <Text style={styles.bodyText}>
                  {candidate.transcriptSnippet}
                </Text>
                <Text style={styles.captionText}>
                  {candidate.reasonSummary}
                </Text>
              </SurfaceCard>
            );
          })}
        </View>
      );
    }

    if (activeTab === "clips") {
      return (
        <View style={styles.sectionStack}>
          <SurfaceCard
            accent="cyan"
            eyebrow="Accepted Clips"
            title="Approved moments only"
          >
            <Text style={styles.bodyText}>
              Accepted clips from the desktop app will appear here.
            </Text>
          </SurfaceCard>

          {companionSnapshot.acceptedClips.length === 0 ? (
            <SurfaceCard
              accent="cyan"
              eyebrow="Accepted Clips"
              title="No accepted clips synced"
            >
              <Text style={styles.bodyText}>
                Approved clips will appear here only when real review decisions
                are connected to mobile.
              </Text>
            </SurfaceCard>
          ) : null}

          {companionSnapshot.acceptedClips.map((clip) => {
            const tone = bandTone(clip.confidenceBand);

            return (
              <SurfaceCard key={clip.id} title={clip.label}>
                <View style={styles.rowBetween}>
                  <Text style={styles.metaText}>{clip.segmentLabel}</Text>
                  <View
                    style={[
                      styles.bandChip,
                      { backgroundColor: tone.backgroundColor },
                    ]}
                  >
                    <Text
                      style={[styles.bandChipLabel, { color: tone.textColor }]}
                    >
                      {tone.label}
                    </Text>
                  </View>
                </View>
                <Text style={styles.bodyText}>{clip.transcriptSnippet}</Text>
              </SurfaceCard>
            );
          })}
        </View>
      );
    }

    if (activeTab === "profiles") {
      return (
        <View style={styles.sectionStack}>
          <SurfaceCard
            accent="violet"
            eyebrow="Profiles"
            title="Profiles on the go"
          >
            <Text style={styles.bodyText}>
              Mobile will show which profile is active. Use the desktop app to
              create profiles and scan videos.
            </Text>
          </SurfaceCard>

          {companionSnapshot.profiles.length === 0 ? (
            <SurfaceCard
              accent="violet"
              eyebrow="Profiles"
              title="No synced profiles yet"
            >
              <Text style={styles.bodyText}>
                Create profiles in the desktop app. They will appear here when
                sync is available.
              </Text>
            </SurfaceCard>
          ) : null}

          {companionSnapshot.profiles.map((profile) => (
            <SurfaceCard
              accent="violet"
              eyebrow={profile.mode}
              key={profile.id}
              title={profile.label}
            >
              <Text style={styles.bodyText}>{profile.description}</Text>
              <Text style={styles.metaText}>
                {profile.weightCount} profile settings
              </Text>
            </SurfaceCard>
          ))}
        </View>
      );
    }

    return (
      <View style={styles.sectionStack}>
        <SurfaceCard
          accent="magenta"
          eyebrow="Companion Status"
          title="Mobile companion"
        >
          <Text style={styles.bodyText}>
            {companionSnapshot.dashboard.statusLabel}
          </Text>
          <Text style={styles.captionText}>
            {companionSnapshot.dashboard.surfaceNote}
          </Text>
        </SurfaceCard>

        <View style={styles.metricsGrid}>
          <MetricCard
            label="Projects"
            value={String(companionSnapshot.dashboard.projectCount)}
          />
          <MetricCard
            label="Pending"
            value={String(companionSnapshot.dashboard.pendingCount)}
          />
          <MetricCard
            label="Accepted"
            value={String(companionSnapshot.dashboard.acceptedCount)}
          />
          <MetricCard
            label="Profiles"
            value={String(companionSnapshot.dashboard.profileCount)}
          />
        </View>

        <SurfaceCard
          accent="cyan"
          eyebrow="Primary Project"
          title={companionSnapshot.dashboard.primaryProjectTitle}
        >
          <Text style={styles.bodyText}>
            Active companion profile:{" "}
            {companionSnapshot.dashboard.primaryProfileLabel}
          </Text>
          <Text style={styles.metaText}>
            Updated {companionSnapshot.dashboard.lastUpdatedLabel}
          </Text>
        </SurfaceCard>

        <SurfaceCard
          accent="violet"
          eyebrow="Out Of Scope"
          title="Keep mobile honest"
        >
          {companionSnapshot.guardrails.map((item) => (
            <Text key={item} style={styles.listItem}>
              - {item}
            </Text>
          ))}
        </SurfaceCard>
      </View>
    );
  }

  /* App layout boundary */
  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.orb, styles.orbLeft]} />
      <View style={[styles.orb, styles.orbRight]} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Image
            accessibilityLabel="vaexcore pulse logo"
            resizeMode="cover"
            source={pulseLogo}
            style={styles.logo}
          />
          <Text style={styles.kicker}>vaexcore pulse companion</Text>
          <Text style={styles.title}>
            Review your queue away from the desk.
          </Text>
          <Text style={styles.subtitle}>
            Keep an eye on projects, review status, and accepted clips. Use the
            desktop app when you are ready to scan or edit.
          </Text>
        </View>

        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>Sync not connected yet</Text>
        </View>

        {renderTabContent()}

        <TabRail
          activeTab={activeTab}
          onSelect={(tab) => {
            startTransition(() => {
              setActiveTab(tab);
            });
          }}
          tabs={mobileTabs}
        />
      </ScrollView>
    </View>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
};

/* Metric card boundary */
function MetricCard({ label, value }: MetricCardProps) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

/* Mobile style boundary */
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#05021b",
  },
  scrollContent: {
    gap: 18,
    paddingTop: 72,
    paddingHorizontal: 18,
    paddingBottom: 36,
  },
  orb: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.18,
  },
  orbLeft: {
    top: 70,
    left: -70,
    width: 220,
    height: 220,
    backgroundColor: "#42ade6",
  },
  orbRight: {
    top: 260,
    right: -90,
    width: 260,
    height: 260,
    backgroundColor: "#c93fd7",
  },
  header: {
    gap: 10,
  },
  logo: {
    width: 86,
    height: 86,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(167, 202, 255, 0.16)",
  },
  kicker: {
    color: "#62d9ff",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: {
    color: "#f8fbff",
    fontSize: 32,
    lineHeight: 34,
    fontWeight: "700",
  },
  subtitle: {
    color: "rgba(238, 244, 255, 0.74)",
    fontSize: 15,
    lineHeight: 22,
  },
  statusPill: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(201, 63, 215, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(201, 63, 215, 0.28)",
  },
  statusPillText: {
    color: "#fac6ff",
    fontSize: 12,
    fontWeight: "700",
  },
  sectionStack: {
    gap: 14,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metricCard: {
    flexGrow: 1,
    minWidth: 145,
    padding: 16,
    borderRadius: 22,
    backgroundColor: "rgba(8, 10, 28, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(167, 202, 255, 0.12)",
  },
  metricLabel: {
    color: "rgba(238, 244, 255, 0.62)",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  metricValue: {
    marginTop: 8,
    color: "#f8fbff",
    fontSize: 26,
    fontWeight: "700",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  bandChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  bandChipLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  bodyText: {
    color: "#eef4ff",
    fontSize: 15,
    lineHeight: 22,
  },
  mutedText: {
    color: "rgba(238, 244, 255, 0.66)",
    fontSize: 13,
    lineHeight: 19,
  },
  captionText: {
    color: "#b8c0df",
    fontSize: 13,
    lineHeight: 19,
  },
  metaText: {
    color: "rgba(238, 244, 255, 0.58)",
    fontSize: 12,
    fontWeight: "600",
  },
  listItem: {
    color: "#eef4ff",
    fontSize: 14,
    lineHeight: 21,
  },
});
