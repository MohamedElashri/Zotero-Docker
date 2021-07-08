'use strict';

import {
    RECEIVE_META,
    RECEIVE_ITEM_TYPE_CREATOR_TYPES,
    RECEIVE_ITEM_TYPE_FIELDS,
    RECEIVE_ITEM_TEMPLATE,
} from '../constants/actions.js';

const itemTypeCreatorTypes = (state = {}, action) => {
	switch(action.type) {
		case RECEIVE_ITEM_TYPE_CREATOR_TYPES:
			return {
				...state,
				[action.itemType]: action.creatorTypes
			};
		default:
			return state;
	}
};

const itemTypeFields = (state = {}, action) => {
	switch(action.type) {
		case RECEIVE_ITEM_TYPE_FIELDS:
			return {
				...state,
				[action.itemType]: action.fields
			};
		default:
			return state;
	}
};

const itemTemplates = (state = {}, action) => {
	switch(action.type) {
		case RECEIVE_ITEM_TEMPLATE:
			return {
				...state,
				[action.itemType]: action.template
			};
		default:
			return state;
	}
};

const meta = (state = {
	itemTypeCreatorTypes: {},
	itemTypeFields: {},
	itemTemplates: {}
}, action) => {
	switch(action.type) {
		case RECEIVE_META:
			return {
				...state,
				itemTypes: action.itemTypes,
				itemFields: action.itemFields,
				creatorFields: action.creatorFields
			};
		case RECEIVE_ITEM_TYPE_CREATOR_TYPES:
			return {
				...state,
				itemTypeCreatorTypes: itemTypeCreatorTypes(state.itemTypeCreatorTypes, action)
			};
		case RECEIVE_ITEM_TYPE_FIELDS:
			return {
				...state,
				itemTypeFields: itemTypeFields(state.itemTypeFields, action)
			};
		case RECEIVE_ITEM_TEMPLATE:
			return {
				...state,
				itemTemplates: itemTemplates(state.itemTemplates, action)
			};
	}

	return state;
};

export default meta;
