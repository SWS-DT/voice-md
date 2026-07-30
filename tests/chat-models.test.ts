import assert from 'node:assert/strict';
import test from 'node:test';
import {
	CURATED_CHAT_MODELS,
	CUSTOM_CHAT_MODEL_OPTION,
	DEFAULT_CHAT_MODEL,
	isCuratedChatModel,
	normalizeChatModel,
} from '../src/settings/chat-models';

void test('normalizes missing and blank model values to the default', () => {
	assert.equal(normalizeChatModel(undefined), DEFAULT_CHAT_MODEL);
	assert.equal(normalizeChatModel(null), DEFAULT_CHAT_MODEL);
	assert.equal(normalizeChatModel('   '), DEFAULT_CHAT_MODEL);
});

void test('trims configured model IDs without replacing custom models', () => {
	assert.equal(normalizeChatModel('  gpt-custom-snapshot  '), 'gpt-custom-snapshot');
});

void test('curated model options are unique and include the default', () => {
	const modelIds = CURATED_CHAT_MODELS.map(([model]) => model);
	assert.equal(new Set(modelIds).size, modelIds.length);
	assert.ok(modelIds.includes(DEFAULT_CHAT_MODEL));
	assert.ok(!modelIds.includes(CUSTOM_CHAT_MODEL_OPTION));
});

void test('distinguishes curated and custom model IDs', () => {
	assert.equal(isCuratedChatModel(DEFAULT_CHAT_MODEL), true);
	assert.equal(isCuratedChatModel('gpt-custom-snapshot'), false);
});
