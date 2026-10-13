// 화면은 이 파일만 사용한다. config.js에 저장소가 설정돼 있으면 GitHub, 아니면 데모 저장소.
import { GITHUB_REPO } from './config.js';

const impl = GITHUB_REPO ? await import('./store-github.js') : await import('./store-demo.js');

export const {
  listEntries, getSummary, getEntry, createEntry, updateEntry, deleteEntry,
  getUser, signIn, signOut, isDemo,
} = impl;
