'use strict';

import cx from 'classnames';
import { DndProvider } from 'react-dnd';
import HTML5toTouch from 'react-dnd-multi-backend/dist/cjs/HTML5toTouch';
import MultiBackend from 'react-dnd-multi-backend';
import PropTypes from 'prop-types';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import { CSSTransition } from 'react-transition-group';

import CustomDragLayer from '../component/drag-layer';
import ItemDetails from '../component/item/details';
import Items from '../component/item/items';
import Libraries from '../component/libraries';
import Messages from '../component/messages';
import MobileNav from './ui/mobile-nav';
import Navbar from './ui/navbar';
import Ongoing from './ongoing';
import SearchBackdrop from './search-backdrop';
import TagSelector from '../component/tag-selector';
import TouchHeaderContainer from '../container/touch-header';
import TouchNote from '../component/touch-note';
import TouchAttachment from '../component/touch-attachment';
import TouchTagSelector from '../component/touch-tag-selector';
import TouchSideFooter from '../component/touch-side-footer';
import withDevice from '../enhancers/with-device';
import { getSerializedQuery } from '../common/state';
import { pick } from '../common/immutable';
import ZoteroConnectorNotifier from './zotero-connector-notifier';
import TitleUpdater from './title-updater';
import ZoteroStreamingClient from './zotero-streaming-client';
import ModalManager from './modal-manager';


const Library = props => {
	const { attachmentKey, collectionKey, config, device, fetchLibrarySettings, isLibraryReadOnly,
	isNavBarOpen, isSearchMode, isSelectMode, isSynced, itemsSource, libraryKey, noteKey,
	resetLibrary, search, searchState, tags, toggleNavbar, useTransitions, qmode, view } = props;

	const [hasUserTypeChanged, setHasUserTypeChanged] = useState(false);
	const [isSearchModeTransitioning, setIsSearchModeTransitioning] = useState(false);
	const prevUserType = useRef(device.userType);
	const prevShouldUseSidebar = useRef(device.shouldUseSidebar);
	const wasSearchMode = useRef(isSearchMode);
	const prevItemsSource = useRef(itemsSource);
	const wasSynced = useRef(isSynced);

	useEffect(() => {
		if(device.userType !== prevUserType.current) {
			setHasUserTypeChanged(true);
			setTimeout(() => setHasUserTypeChanged(false), 0);
		}

		if(isNavBarOpen && !device.shouldUseSidebar && prevShouldUseSidebar.current) {
			toggleNavbar(false);
		}

		document.documentElement.classList.toggle('keyboard', !!device.isKeyboardUser);
		document.documentElement.classList.toggle('mouse', !!device.isMouseUser);
		document.documentElement.classList.toggle('touch', !!device.isTouchUser);
		document.documentElement.classList.toggle('scrollbar-style-permanent', device.scrollbarWidth > 0);

		prevUserType.current = device.userType;
	}, [device]);

	useEffect(() => {
		if(isSearchMode && !wasSearchMode.current) {
			setIsSearchModeTransitioning(true);
			setTimeout(() => setIsSearchModeTransitioning(false), 250);
		}
		wasSearchMode.current = isSearchMode;
	}, [isSearchMode]);

	useEffect(() => {
		prevItemsSource.current = itemsSource;
	}, [itemsSource]);

	useEffect(() => {
		if(isSynced === false && wasSynced.current === true) {
			setTimeout(() => {
				resetLibrary(libraryKey);
				setTimeout(() => fetchLibrarySettings(libraryKey), 0);
			}, 0);
		}
		wasSynced.current = isSynced;
	}, [isSynced])


	const handleNavbarToggle = useCallback(
		() => toggleNavbar(null)
	);

	//@TODO: use `useSourceSignature` hook inside components instead
	var key;
	if(itemsSource == 'collection') {
		key = `${libraryKey}-${collectionKey}`;
	} else if(itemsSource == 'query') {
		key = `${libraryKey}-query-${getSerializedQuery(
			{ collection: collectionKey, tag: tags, q: search, qmode }
		)}`;
	} else {
		key = `${libraryKey}-${itemsSource}`;
	}

	return (
		<React.Fragment>
			<DndProvider backend={ MultiBackend } options={ HTML5toTouch }>
			<CustomDragLayer />
			<div className={ cx('library-container', {
					'navbar-nav-opened': isNavBarOpen,
					'no-transitions': !useTransitions || hasUserTypeChanged,
					'search-active': (isSearchMode || (!isSearchMode && isSearchModeTransitioning)) && (itemsSource !== 'query' && prevItemsSource.current !== 'query'),
					'search-cancel': isSearchModeTransitioning && !isSearchMode,
					'search-init': (isSearchMode && !searchState.hasViewedResult) || (isSearchModeTransitioning && !isSearchMode),
					'search-results': (isSearchMode || (!isSearchMode && isSearchModeTransitioning)) && (itemsSource === 'query' || prevItemsSource.current === 'query'),
					'touch-tag-selector-active': tags.length > 0,
					'view-note-active': noteKey,
					'view-attachment-active': attachmentKey,
					[`view-${view}-active`]: true,
				}) }>
				<MobileNav
					entries={ config.menus.mobile }
					{...pick(props, ['toggleNavbar']) }
				/>
				<div className="site-wrapper">
					<Navbar entries={ config.menus.desktop } />
					<main>
						<section className={ `library ${ view === 'library' ? 'active' : '' }` }>
							{ device.isTouchOrSmall && (
								<TouchHeaderContainer
									className="hidden-sm-up darker"
									variant={ TouchHeaderContainer.variants.MOBILE }
								/>
							) }
							<header className="sidebar">
								<h2 className="offscreen">Web library</h2>
								{ device.isTouchOrSmall && (
									<TouchHeaderContainer
										variant={ TouchHeaderContainer.variants.NAVIGATION }
										className="hidden-xs-down hidden-mouse-md-up darker"
									/>
								) }
								<Libraries />
								{ device.isTouchOrSmall ? (
									<React.Fragment>
										<TouchTagSelector />
										<TouchSideFooter />
									</React.Fragment>
									) : <TagSelector /> }
								<Ongoing />
							</header>
							<CSSTransition
								in={ (device.isSingleColumn && isSearchMode) || !device.isSingleColumn }
								timeout={ 250 }
								classNames="fade"
								enter={ device.isSingleColumn && (view !== 'item-list' && view !== 'item-details') }
								exit={ device.isSingleColumn && (view !== 'item-list' && view !== 'item-details') }
							>
								<section className={ cx('items', {
									'active': view === 'item-list',
									'select-mode': device.isTouchOrSmall && isSelectMode,
									'read-only': isLibraryReadOnly,
								})}>
									{/* Tablet TouchHeader */}
									{ device.isTouchOrSmall && (
										<TouchHeaderContainer
											className="hidden-xs-down hidden-lg-up hidden-mouse darker"
											variant={ TouchHeaderContainer.variants.SOURCE_AND_ITEM }
										/>
									) }
									<Items key={ key } isSearchModeTransitioning={ isSearchModeTransitioning } />
									<ItemDetails active={ view === 'item-details' } />
									{ device.isTouchOrSmall && <TouchNote /> }
									{ device.isTouchOrSmall && <TouchAttachment /> }
									<CSSTransition
										in={ device.isSingleColumn && isSearchMode && itemsSource !== 'query' }
										timeout={ 250 }
										classNames="fade"
										unmountOnExit
									>
										<SearchBackdrop { ...pick(props, ['triggerSearchMode']) } />
									</CSSTransition>
								</section>
							</CSSTransition>
						</section>
					</main>
					<div
						className="nav-cover"
						onClick={ handleNavbarToggle }
					/>
				</div>
				<ModalManager />
				<Messages />
			</div>
			</DndProvider>
			<ZoteroConnectorNotifier />
			<TitleUpdater />
			<ZoteroStreamingClient />
		</React.Fragment>
	);
}

Library.propTypes = {
	collectionKey: PropTypes.string,
	config: PropTypes.object.isRequired,
	device: PropTypes.object,
	isLibraryReadOnly: PropTypes.bool,
	isNavBarOpen: PropTypes.bool,
	isSearchMode: PropTypes.bool,
	isSelectMode: PropTypes.bool,
	isSynced: PropTypes.bool,
	itemsSource: PropTypes.string,
	libraryKey: PropTypes.string,
	noteKey: PropTypes.string,
	qmode: PropTypes.string,
	resetLibrary: PropTypes.func,
	search: PropTypes.string,
	searchState: PropTypes.object,
	tags: PropTypes.array,
	toggleModal: PropTypes.func,
	toggleNavbar: PropTypes.func,
	useTransitions: PropTypes.bool,
	view: PropTypes.string,
};

export default withDevice(Library);
