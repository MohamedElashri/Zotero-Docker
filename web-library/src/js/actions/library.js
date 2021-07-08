'use strict';
import {
	REQUEST_LIBRARY_SETTINGS,
	RECEIVE_LIBRARY_SETTINGS,
	ERROR_LIBRARY_SETTINGS,
	RESET_LIBRARY
} from '../constants/actions';
import api from 'zotero-api-client';

const fetchLibrarySettings = libraryKey => {
	return async (dispatch, getState) => {
		const state = getState();
		const config = state.config;

		dispatch({
			type: REQUEST_LIBRARY_SETTINGS,
			libraryKey
		});
		try {
			const response = await api(config.apiKey, config.apiConfig)
				.library(libraryKey)
				.settings()
				.get();

			const settings = response.getData();

			dispatch({
				type: RECEIVE_LIBRARY_SETTINGS,
				libraryKey,
				settings,
				response
			});
			return settings;
		} catch(error) {
			dispatch({
				type: ERROR_LIBRARY_SETTINGS,
				libraryKey,
				error
			});
			throw error;
		}
	};
}

const resetLibrary = libraryKey => {
	return async dispatch => {
		dispatch({
			type: RESET_LIBRARY,
			libraryKey
		});
	};
}

export { fetchLibrarySettings, resetLibrary };
