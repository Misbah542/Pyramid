/**
 * Repository insights.
 *
 * Every number here is computed from the analysed graph. When a metric cannot
 * be derived from what the analyser actually produced, it is reported as
 * unavailable rather than estimated — and none of these describe a codebase as
 * good or bad, only as it is shaped.
 */

import type { GraphNode, RepositoryGraph } from '@shared/graph';
import { languageLabel } from '@shared/language';
import {
  degreeOf,
  findDependencyCycles,
  getModules,
  type GraphIndex,
} from '@shared/graph-utils';
import { formatBytes, formatCount, percent } from '@/lib/format';

export interface Insight {
  id: string;
  label: string;
  /** Headline value, already formatted. `null` renders the unavailable state. */
  value: string | null;
  /** What the number means and how it was derived. */
  meaning: string;
  /** Node to focus when the insight is clicked. */
  nodeId?: string;
  /** Extra rows, e.g. a ranked list. */
  items?: Array<{ id: string; label: string; value: string; nodeId?: string }>;
  tone?: 'neutral' | 'notable';
}

export interface InsightSection {
  id: string;
  title: string;
  insights: Insight[];
}

export function computeInsights(graph: RepositoryGraph, index: GraphIndex): InsightSection[] {
  const { metadata, nodes } = graph;

  const files = nodes.filter((node) => node.type === 'file' || node.type === 'test' || node.type === 'config');
  const modules = getModules(index);
  const externals = nodes.filter((node) => node.type === 'external');

  // A line count exists for every file the analyser actually read.
  const parsedFiles = files.filter((node) => node.metadata.lineCount !== undefined);
  const totalLines = parsedFiles.reduce((sum, node) => sum + (node.metadata.lineCount ?? 0), 0);

  const largestModules = [...modules]
    .sort((a, b) => (b.metadata.descendantFileCount ?? 0) - (a.metadata.descendantFileCount ?? 0))
    .slice(0, 5);

  const connectedFiles = [...files]
    .filter((node) => degreeOf(node) > 0)
    .sort((a, b) => degreeOf(b) - degreeOf(a) || a.path.localeCompare(b.path))
    .slice(0, 5);

  const connectedModules = [...modules]
    .filter((node) => degreeOf(node) > 0)
    .sort((a, b) => degreeOf(b) - degreeOf(a) || a.path.localeCompare(b.path))
    .slice(0, 5);

  const topExternals = [...externals]
    .sort(
      (a, b) =>
        (b.metadata.incomingDependencyCount ?? 0) - (a.metadata.incomingDependencyCount ?? 0) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 6);

  const cycles = findDependencyCycles(
    index,
    modules.map((node) => node.id),
    6,
  );

  const testsByModule = new Map<string, { tests: number; files: number }>();
  for (const file of files) {
    const moduleId = file.moduleId ?? 'root';
    const entry = testsByModule.get(moduleId) ?? { tests: 0, files: 0 };
    entry.files += 1;
    if (file.metadata.isTest) entry.tests += 1;
    testsByModule.set(moduleId, entry);
  }
  const modulesWithoutTests = modules.filter((module) => (testsByModule.get(module.id)?.tests ?? 0) === 0);

  const dependencyEdges = graph.edges.filter((edge) => edge.type === 'import' || edge.type === 'external-dependency');
  const incomingTotals = new Map<string, number>();
  for (const edge of dependencyEdges) {
    incomingTotals.set(edge.target, (incomingTotals.get(edge.target) ?? 0) + 1);
  }
  const topIncoming = [...incomingTotals.values()].sort((a, b) => b - a).slice(0, 5);
  const concentration = dependencyEdges.length
    ? topIncoming.reduce((sum, value) => sum + value, 0) / dependencyEdges.length
    : 0;

  const structure: InsightSection = {
    id: 'structure',
    title: 'Structure',
    insights: [
      {
        id: 'files',
        label: 'Source files',
        value: formatCount(metadata.fileCount),
        meaning: `${formatCount(metadata.totalTreeEntries)} files exist on this branch; RepoVerse maps the ${formatCount(metadata.fileCount)} it recognises as source, test or configuration.`,
      },
      {
        id: 'directories',
        label: 'Directories',
        value: formatCount(metadata.directoryCount),
        meaning: 'Every directory that contains at least one mapped file.',
      },
      {
        id: 'lines',
        label: 'Lines read',
        value: totalLines > 0 ? formatCount(totalLines) : null,
        meaning:
          totalLines > 0
            ? `Counted across the ${formatCount(parsedFiles.length)} files that were opened. Files left unread contribute nothing to this number.`
            : 'No file contents were read, so line counts are not available.',
      },
      {
        id: 'languages',
        label: 'Languages detected',
        value: metadata.languageStats.length ? formatCount(metadata.languageStats.length) : null,
        meaning: 'Detected from file extensions across the mapped files.',
        items: metadata.languageStats.slice(0, 6).map((stat) => ({
          id: stat.language,
          label: languageLabel(stat.language),
          value: `${formatCount(stat.files)} ${stat.files === 1 ? 'file' : 'files'}`,
        })),
      },
      {
        id: 'largest-modules',
        label: 'Largest modules',
        value: largestModules[0]?.name ?? null,
        nodeId: largestModules[0]?.id,
        meaning: largestModules.length
          ? `${largestModules[0].name} holds ${formatCount(largestModules[0].metadata.descendantFileCount)} of ${formatCount(metadata.fileCount)} mapped files (${percent(largestModules[0].metadata.descendantFileCount ?? 0, metadata.fileCount)}).`
          : 'This repository has no top-level modules.',
        items: largestModules.map((module) => ({
          id: module.id,
          label: module.name,
          value: `${formatCount(module.metadata.descendantFileCount)} files · ${formatBytes(module.metadata.descendantByteSize)}`,
          nodeId: module.id,
        })),
      },
    ],
  };

  const dependencies: InsightSection = {
    id: 'dependencies',
    title: 'Dependencies',
    insights: [
      {
        id: 'connected-module',
        label: 'Most connected module',
        value: connectedModules[0]?.name ?? null,
        nodeId: connectedModules[0]?.id,
        meaning: connectedModules[0]
          ? `Connected to ${formatCount(degreeOf(connectedModules[0]))} other modules based on detected static imports between their files.`
          : 'No module-to-module imports were detected. The analyser found no cross-module dependencies, or no files were parsed.',
        items: connectedModules.map((module) => ({
          id: module.id,
          label: module.name,
          value: `${formatCount(module.metadata.outgoingDependencyCount)} out · ${formatCount(module.metadata.incomingDependencyCount)} in`,
          nodeId: module.id,
        })),
      },
      {
        id: 'connected-file',
        label: 'Most connected files',
        value: connectedFiles[0]?.name ?? null,
        nodeId: connectedFiles[0]?.id,
        meaning: connectedFiles[0]
          ? `${connectedFiles[0].name} participates in ${formatCount(degreeOf(connectedFiles[0]))} import relationships. High connectivity means many files would be touched by a change here — it does not imply the file is wrong.`
          : 'No file-level import relationships were resolved.',
        items: connectedFiles.map((file) => ({
          id: file.id,
          label: file.path,
          value: `${formatCount(file.metadata.incomingDependencyCount)} in · ${formatCount(file.metadata.outgoingDependencyCount)} out`,
          nodeId: file.id,
        })),
      },
      {
        id: 'externals',
        label: 'External packages',
        value: formatCount(metadata.externalDependencyCount),
        meaning: 'Third-party packages referenced by at least one import statement. Declared-but-unused dependencies in manifests are not counted.',
        items: topExternals.map((pkg) => ({
          id: pkg.id,
          label: pkg.name,
          value: `${formatCount(pkg.metadata.incomingDependencyCount)} ${pkg.metadata.incomingDependencyCount === 1 ? 'importer' : 'importers'}`,
          nodeId: pkg.id,
        })),
      },
      {
        id: 'cycles',
        label: 'Circular module dependencies',
        value: cycles.length ? formatCount(cycles.length) : '0',
        tone: cycles.length ? 'notable' : 'neutral',
        meaning: cycles.length
          ? 'Groups of modules that import each other, directly or through a chain. Detected from static imports only.'
          : 'No import cycles were found between top-level modules in the detected dependency edges.',
        items: cycles.map((ring, position) => ({
          id: `cycle-${position}`,
          label: ring
            .map((id) => index.nodes.get(id)?.name ?? id)
            .join(' → '),
          value: `${ring.length} modules`,
          nodeId: ring[0],
        })),
      },
      {
        id: 'concentration',
        label: 'Dependency concentration',
        value: dependencyEdges.length ? `${Math.round(concentration * 100)}%` : null,
        meaning: dependencyEdges.length
          ? `The five most imported targets account for ${Math.round(concentration * 100)}% of all ${formatCount(dependencyEdges.length)} detected import edges.`
          : 'No import edges were detected, so concentration cannot be measured.',
      },
    ],
  };

  const coverage: InsightSection = {
    id: 'coverage',
    title: 'Tests & analysis coverage',
    insights: [
      {
        id: 'tests',
        label: 'Test files',
        value: formatCount(metadata.testFileCount),
        meaning: `${percent(metadata.testFileCount, metadata.fileCount)} of mapped files match a test naming or directory convention. This counts files, not assertions or coverage.`,
      },
      {
        id: 'test-distribution',
        label: 'Modules without test files',
        value: modules.length ? formatCount(modulesWithoutTests.length) : null,
        meaning: modules.length
          ? 'Top-level modules where no file matched a test convention. Tests living in a separate root-level test module will show up here.'
          : 'No top-level modules to compare.',
        items: modulesWithoutTests.slice(0, 6).map((module) => ({
          id: module.id,
          label: module.name,
          value: `${formatCount(module.metadata.descendantFileCount)} files`,
          nodeId: module.id,
        })),
      },
      {
        id: 'parsed',
        label: 'Files opened',
        value: `${formatCount(metadata.parsedFileCount)} / ${formatCount(metadata.fileCount)}`,
        meaning:
          metadata.skippedFileCount > 0
            ? `${formatCount(metadata.skippedFileCount)} files were skipped because of size or request limits. They appear in the structure but contribute no dependency edges.`
            : 'Every mapped file that RepoVerse can parse was read.',
        tone: metadata.skippedFileCount > 0 ? 'notable' : 'neutral',
      },
      {
        id: 'symbols',
        label: 'Symbol extraction',
        value: metadata.symbolExtraction ? 'Enabled' : null,
        meaning: metadata.symbolExtraction
          ? 'Classes, interfaces and top-level functions were extracted for the parsed files and can be explored as nodes.'
          : 'No symbols were extracted for this repository — its languages are mapped for structure only.',
      },
      {
        id: 'graph-size',
        label: 'Graph complexity',
        value: `${formatCount(metadata.nodeCount)} nodes · ${formatCount(metadata.edgeCount)} edges`,
        meaning: `An average of ${(metadata.edgeCount / Math.max(metadata.nodeCount, 1)).toFixed(1)} edges per node across hierarchy and dependency relationships.`,
      },
    ],
  };

  return [structure, dependencies, coverage];
}

export function insightNodeLabel(node: GraphNode | undefined): string {
  return node ? node.path || node.name : 'Unknown';
}
