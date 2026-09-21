import { describe, expect, it } from 'vitest';
import { parseSource } from '../server/analysis/parsers';

describe('TypeScript parsing', () => {
  const source = `
// a comment with import 'not-real'
import React from 'react';
import { useState, type Ref } from "react";
import './styles.css';
export { helper } from '../lib/helper';
const lazy = await import('@/features/lazy');
const legacy = require('node:path');

export abstract class Widget extends Base implements Clickable, Focusable {
  render() {}
}

export interface WidgetProps extends BaseProps {
  id: string;
}

export function mount(target: HTMLElement) {}
export const useWidget = (id: string) => ({ id });
`;

  const parsed = parseSource('typescript', source);

  it('extracts every import form once', () => {
    expect(parsed.imports.map((i) => i.specifier)).toEqual([
      'react',
      './styles.css',
      '../lib/helper',
      '@/features/lazy',
      'node:path',
    ]);
  });

  it('extracts classes with their base types', () => {
    const widget = parsed.symbols.find((s) => s.name === 'Widget');
    expect(widget?.kind).toBe('class');
    expect(widget?.extends).toEqual(['Base']);
    expect(widget?.implements).toEqual(['Clickable', 'Focusable']);
  });

  it('extracts interfaces and both function forms', () => {
    expect(parsed.symbols.find((s) => s.name === 'WidgetProps')?.kind).toBe('interface');
    expect(parsed.symbols.find((s) => s.name === 'mount')?.kind).toBe('function');
    expect(parsed.symbols.find((s) => s.name === 'useWidget')?.kind).toBe('function');
  });
});

describe('Python parsing', () => {
  const parsed = parseSource(
    'python',
    `
from __future__ import annotations
import os, sys
from .models import User
from app.services.billing import charge

class Invoice(Base):
    def total(self):
        return 0

def render(invoice):
    return invoice
`,
  );

  it('handles absolute, relative and multi imports', () => {
    expect(parsed.imports.map((i) => i.specifier)).toEqual([
      '__future__',
      'os',
      'sys',
      '.models',
      'app.services.billing',
    ]);
  });

  it('records module-level definitions but not methods', () => {
    expect(parsed.symbols.map((s) => s.name)).toEqual(['Invoice', 'render']);
    expect(parsed.symbols[0].extends).toEqual(['Base']);
  });
});

describe('Go parsing', () => {
  const parsed = parseSource(
    'go',
    `
package storage

import (
	"database/sql"
	logger "go.uber.org/zap"
)

import "context"

type Store interface {
	Get(ctx context.Context) error
}

type PostgresStore struct{}

func NewStore(db *sql.DB) *PostgresStore { return nil }
func (s *PostgresStore) Get(ctx context.Context) error { return nil }
`,
  );

  it('reads grouped and single imports and the package name', () => {
    expect(parsed.packageName).toBe('storage');
    expect(parsed.imports.map((i) => i.specifier)).toEqual(['database/sql', 'go.uber.org/zap', 'context']);
  });

  it('distinguishes interfaces from structs', () => {
    expect(parsed.symbols.find((s) => s.name === 'Store')?.kind).toBe('interface');
    expect(parsed.symbols.find((s) => s.name === 'PostgresStore')?.kind).toBe('class');
    expect(parsed.symbols.find((s) => s.name === 'NewStore')?.kind).toBe('function');
  });
});

describe('Kotlin parsing', () => {
  const parsed = parseSource(
    'kotlin',
    `
package com.acme.feature.profile

import androidx.lifecycle.ViewModel
import com.acme.data.ProfileRepository

@HiltViewModel
class ProfileViewModel(private val repository: ProfileRepository) : ViewModel() {
    fun refresh() {}
}

interface ProfileSource
`,
  );

  it('captures the package declaration separately from imports', () => {
    expect(parsed.packageName).toBe('com.acme.feature.profile');
    expect(parsed.imports.map((i) => i.specifier)).toEqual([
      'androidx.lifecycle.ViewModel',
      'com.acme.data.ProfileRepository',
    ]);
  });

  it('extracts classes, supertypes, interfaces and functions', () => {
    const viewModel = parsed.symbols.find((s) => s.name === 'ProfileViewModel');
    expect(viewModel?.kind).toBe('class');
    expect(viewModel?.extends).toEqual(['ViewModel']);
    expect(parsed.symbols.find((s) => s.name === 'ProfileSource')?.kind).toBe('interface');
    expect(parsed.symbols.find((s) => s.name === 'refresh')?.kind).toBe('function');
  });
});

describe('robustness', () => {
  it('never throws on unknown languages or junk input', () => {
    expect(() => parseSource('brainfuck', '+++[->+++<]')).not.toThrow();
    expect(parseSource('typescript', '').imports).toEqual([]);
    expect(parseSource('typescript', 'import '.repeat(5000)).imports.length).toBeLessThan(5);
  });

  it('counts lines even when nothing is parsed', () => {
    expect(parseSource('markdown', 'a\nb\nc').lineCount).toBe(3);
  });
});
