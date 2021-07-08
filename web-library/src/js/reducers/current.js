import { LOCATION_CHANGE } from 'connected-react-router';
import { shallowEqual } from 'react-redux';

import {
	CONFIGURE,
	FILTER_TAGS,
	TOGGLE_NAVBAR,
	TOGGLE_TAG_SELECTOR,
	TOGGLE_TOUCH_TAG_SELECTOR,
	TOGGLE_TRANSITIONS,
	TRIGGER_EDITING_ITEM,
	TRIGGER_FOCUS,
	TRIGGER_HIGHLIGHTED_COLLECTIONS,
	TRIGGER_SEARCH_MODE,
	TRIGGER_SELECT_MODE,
	TRIGGER_USER_TYPE_CHANGE,
} from '../constants/actions';

import { tagsFromUrlPart } from '../common/navigation';
import { getParamsFromRoute } from '../common/state';

const stateDefault = {
	collectionKey: null,
	editingItemKey: null,
	isNavBarOpen: false,
	isSelectMode: false,
	isSearchMode: false,
	isTagSelectorOpen: true,
	isTouchTagSelectorOpen: false,
	itemKey: null,
	itemKeys: [],
	itemsSource: null,
	libraryKey: null,
	qmode: 'titleCreatorYear',
	search: '',
	searchState: {},
	tags: [],
	tagsSearchString: '',
	userLibraryKey: null,
	useTransitions: false,
	view: 'library',
	highlightedCollections: [],
};

const getLibraryKey = (params, config) => {
	if(params.groupid && params.groupslug) {
		return `g${params.groupid}`;
	}
	if(params.userslug) {
		if(params.userslug == config.userSlug) {
			return `u${config.userId}`;
		}
		const otherUsersLibrary = config.libraries
			.find(l => l.slug === params.userslug);
		if(otherUsersLibrary) {
			return otherUsersLibrary.key;
		}
	}
	return config.defaultLibraryKey;
}


const current = (state = stateDefault, action, { config = {}, device = {} } = {}) => {
	switch(action.type) {
		case CONFIGURE:
			return {
				...state,
				userLibraryKey: `u${action.userId}`,
			}
		case LOCATION_CHANGE:
			if(!config) { return state; }
			var params = getParamsFromRoute({ router: { ...action.payload } });

			// need to validate params.items because routes is incapable of handling groups in regexp, see routes.js
			var isValidItemsKey = !(params.items && params.items.match(/^(?:[a-zA-Z0-9]{8},?)+$/) === null);
			var search = params.search ? decodeURIComponent(params.search) : '';
			var qmode = params.qmode || 'titleCreatorYear';
			var isTrash = action.payload.location.pathname.includes('/trash');
			var isMyPublications = action.payload.location.pathname.includes('/publications');
			var collectionKey = params.collection || null;
			var itemKeys = params.items && isValidItemsKey ? params.items.split(',') : [];
			var noteKey = params.note || null;
			var attachmentKey = params.attachment || null;
			var tags = tagsFromUrlPart(params.tags);
			var isSelectMode = itemKeys.length > 1 ? true : state.isSelectMode;
			var view = params.view;
			var libraryKey = getLibraryKey(params, config);
			var itemsSource;
			var searchState = state.searchState;
			var itemKey = itemKeys && itemKeys.length === 1 ? itemKeys[0] : null

			if(tags.length || search.length) {
				itemsSource = 'query';
			} else if(collectionKey) {
				itemsSource = 'collection';
			} else if(isTrash) {
				itemsSource = 'trash';
			} else if(isMyPublications) {
				itemsSource = 'publications';
			} else {
				itemsSource = 'top';
			}

			if(!view) {
				//@TODO: Refactor
				view = itemKeys.length ?
					isSelectMode ? 'item-list' : 'item-details'
					: itemsSource === 'collection' && collectionKey ? 'collection' :
					['query', 'trash', 'publications'].includes(itemsSource) ? 'item-list' :
					(params.userslug || params.groupid) ? 'library' : 'libraries';
			}

			if(!state.isSearchMode && itemsSource === 'query') {
				// record searchState on devices with no explicit "search mode" button
				searchState = {
					hasViewedResult: false,
					triggerItem: state.itemKey,
					triggerView: state.view,
				}
			}

			if(view === 'item-details' && state.isSearchMode) {
				searchState.hasViewedResult = true;
			}

			if(device.isSingleColumn) {
				isSelectMode = isSelectMode && view === 'item-list';
			}

			return {
				...state,
				attachmentKey,
				collectionKey,
				editingItemKey: itemKey === state.editingItemKey ? state.editingItemKey : null,
				isMyPublications,
				isSearchMode: (itemsSource === 'query' && search.length > 0) || state.isSearchMode,
				isSelectMode,
				isTrash,
				itemKey,
				itemKeys: shallowEqual(itemKeys, state.itemKeys) ? state.itemKeys : itemKeys,
				itemsSource,
				libraryKey,
				noteKey,
				qmode,
				search,
				searchState,
				tags: shallowEqual(tags, state.tags) ? state.tags : tags,
				useTransitions: state.useTransitions,
				view,
			}
		case TRIGGER_EDITING_ITEM:
			return {
				...state,
				editingItemKey: action.isEditing ? action.itemKey : null
			};
		case TOGGLE_TRANSITIONS:
			return {
				...state,
				useTransitions: action.useTransitions
			}
		case TRIGGER_SELECT_MODE:
			return {
				...state,
				isSelectMode: action.isSelectMode,
			}
		case TRIGGER_SEARCH_MODE:
			return {
				...state,
				isSearchMode: action.isSearchMode,
				searchState: action.isSearchMode ? {
					hasViewedResult: false,
					triggerItem: state.itemKey,
					triggerView: state.view,
				} : state.searchState
			}
		case TOGGLE_NAVBAR:
			return {
				...state,
				isNavBarOpen: typeof(action.isOpen) === 'boolean' ? action.isOpen : !state.isNavBarOpen
			}
		case TOGGLE_TAG_SELECTOR:
			return {
				...state,
				isTagSelectorOpen: typeof(action.isOpen) === 'boolean' ? action.isOpen : !state.isTagSelectorOpen
			}
		case TOGGLE_TOUCH_TAG_SELECTOR:
			return {
				...state,
				isTouchTagSelectorOpen: typeof(action.isOpen) === 'boolean' ? action.isOpen : !state.isTouchTagSelectorOpen
			}
		case FILTER_TAGS:
			return {
				...state,
				tagsSearchString: action.tagsSearchString
			}
		case TRIGGER_USER_TYPE_CHANGE:
			return {
				...state,
				editingItemKey: action.userType === 'mouse' && !device.xxs && !device.xs &&
					!device.sm && !device.md ? null : state.editingItemKey
			}
		case TRIGGER_FOCUS:
			return {
				...state,
				isItemsTableFocused: action.section === 'items-table' && action.isOn
			}
		case TRIGGER_HIGHLIGHTED_COLLECTIONS:
			return {
				...state,
				highlightedCollections: action.collections
			}
		default:
			return state;
	}
}

export default current;
