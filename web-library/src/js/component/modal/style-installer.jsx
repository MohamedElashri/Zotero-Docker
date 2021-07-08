import React, { useCallback, useEffect, useState, memo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { CSSTransition } from 'react-transition-group';
import { useDebouncedCallback } from 'use-debounce';
import cx from 'classnames';

import Modal from '../ui/modal';
import Button from '../ui/button';
import Icon from '../ui/icon';
import Input from '../form/input';
import Spinner from '../ui/spinner';
import { coreCitationStyles } from '../../../../data/citation-styles-data.json';
import SearchWorkerFactory from 'webworkify';
import { addCitationStyle, deleteCitationStyle, toggleModal, fetchStyles } from '../../actions';
import { STYLE_INSTALLER } from '../../constants/modals';

const SEARCH_INPUT_DEBOUNCE_DELAY = 300; //ms

const SearchWorker = SearchWorkerFactory(require('../../style-search.worker.js'));

const StyleItem = memo(props => {
	const { isActive, isCore, isSelected, isInstalled, onDelete, onInstall, style } = props;
	const isTouchOrSmall = useSelector(state => state.device.isTouchOrSmall);

	return (
		<li
			className={ cx('style', { selected: isSelected }) }
			key={ style.name }
		>
			<div className="style-title">
				{ style.title }
			</div>
			{
				isActive ? (
					<Button
						className={ cx({
							'btn-circle btn-primary': isTouchOrSmall,
							'btn-outline-light': !isTouchOrSmall
						}) }
						disabled
					>
						{
							isTouchOrSmall ? (
								<Icon type="16/minus-strong" width="16" height="16" />
							) : 'Active'
						}
					</Button>
				) : isCore ? (
					<Button
						className={ cx({
							'btn-circle btn-primary': isTouchOrSmall,
							'btn-outline-light': !isTouchOrSmall
						}) }
						disabled
					>
						{
							isTouchOrSmall ? (
								<Icon type="16/minus-strong" width="16" height="16" />
							) : 'Default'
						}
					</Button>
				) : isInstalled ? (
					<Button
						value={ style.name }
						className={ cx({
							'btn-circle btn-primary': isTouchOrSmall,
							'btn-outline-primary': !isTouchOrSmall
						}) }
						onClick={ onDelete }
					>
						{
							isTouchOrSmall ? (
								<Icon type="16/minus-strong" width="16" height="16" />
							) : 'Remove'
						}
					</Button>
				) : (
					<Button
						value={ style.name }
						className={ cx({
							'btn-circle btn-secondary': isTouchOrSmall,
							'btn-outline-secondary': !isTouchOrSmall
						}) }
						onClick={ onInstall }
					>
						{
							isTouchOrSmall ? (
								<Icon type="16/plus-strong" width="16" height="16" />
							) : 'Add'
						}
					</Button>
				)
			}
		</li>
	);
});

StyleItem.displayName = 'StyleItem';

const StyleInstallerModal = () => {
	const dispatch = useDispatch();
	const isFetching = useSelector(state => state.styles.isFetching);
	const stylesData = useSelector(state => state.styles.stylesData);
	const installedCitationStyles = useSelector(state => state.preferences.installedCitationStyles);
	const currentCitationStyle = useSelector(state=> state.preferences.citationStyle);
	const isTouchOrSmall = useSelector(state => state.device.isTouchOrSmall);
	const isOpen = useSelector(state => state.modal.id === STYLE_INSTALLER);

	const [isWorkerReady, setIsWorkerReady] = useState(false);
	const [isSearching, setIsSearching] = useState(false);
	const [hasResults, setHasResults] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(null);
	const [filterInputValue, setFilterInputValue] = useState('');
	const [matchedCitationStyles, setMatchedCitationStyles] = useState([]);

	const handleWorkerMessage = useCallback(event => {
		const [messageKind, payload] = event.data;
		switch(messageKind) {
			case 'READY':
				setIsWorkerReady(true);
			break;
			case 'FILTER_COMPLETE':
				setIsSearching(false);
				setHasResults(true);
				setMatchedCitationStyles(payload);
			break;
		}
	}, []);

	const [performSearch] = useDebouncedCallback(newFilterValue => {
		setHasResults(false);
		setSelectedIndex(null);

		if(newFilterValue.length > 0) {
			setIsSearching(true);
			SearchWorker.postMessage(['FILTER', newFilterValue.toLowerCase()]);
		}
	}, SEARCH_INPUT_DEBOUNCE_DELAY);

	const handleClose = useCallback(() => {
		dispatch(toggleModal(STYLE_INSTALLER, false));

		// clear filter once modal is really closed, but not before to avoid flicker
		setTimeout(() => {
			setFilterInputValue('');
			setSelectedIndex(null);
		}, 300);
	}, [dispatch]);

	const handleFilterInputChange = useCallback(newValue => {
		setFilterInputValue(newValue);
		performSearch(newValue);
	}, [performSearch]);

	const handleDelete = useCallback(ev => {
		const styleName = ev.currentTarget.value;
		dispatch(deleteCitationStyle(styleName));
	}, [dispatch]);

	const handleInstall = useCallback(ev => {
		const styleName = ev.currentTarget.value;
		const style = matchedCitationStyles.find(c => c.name == styleName);

		dispatch(addCitationStyle(style));
	}, [dispatch, matchedCitationStyles]);

	useEffect(() => {
		SearchWorker.addEventListener('message', handleWorkerMessage);
		return () => {
			SearchWorker.removeEventListener('message', handleWorkerMessage);
		}
	}, [handleWorkerMessage]);

	useEffect(() => {
		if(stylesData !== null) {
			SearchWorker.postMessage(['LOAD', stylesData]);
		}
	}, [stylesData]);

	useEffect(() => {
		if( isOpen && !stylesData && !isFetching) {
			dispatch(fetchStyles());
		}
	}, [dispatch, isOpen, stylesData, isFetching]);

	const isReady = stylesData !== null && !isFetching && isWorkerReady;
	const localCitationStyles = [...coreCitationStyles, ...installedCitationStyles];
	const className = cx({
		'style-installer modal-scrollable modal-lg': true,
		'modal-touch': isTouchOrSmall,
		'loading': !isReady
	});

	return (
		<Modal
			isOpen={ isOpen }
			contentLabel="Citation Style Installer"
			className={ className }
			onRequestClose={ handleClose }
			closeTimeoutMS={ 200 }
		>
			<CSSTransition
				in={ isReady }
				timeout={ 200 }
				classNames="slide"
				mountOnEnter
				unmountOnExit
				exit={ false }
			>
				<div className="modal-content" tabIndex={ -1 }>
					<div className="modal-header">
						{
							isTouchOrSmall ? (
								<React.Fragment>
									<div className="modal-header-left" />
									<div className="modal-header-center">
										<h4 className="modal-title truncate">
											Citation Styles
										</h4>
									</div>
									<div className="modal-header-right">
										<Button
											className="btn-link"
											onClick={ handleClose }
										>
											Close
										</Button>
									</div>
								</React.Fragment>
							) : (
								<React.Fragment>
									<h4 className="modal-title truncate">
										Citation Styles
									</h4>
									<Button
										icon
										className="close"
										onClick={ handleClose }
									>
										<Icon type={ '16/close' } width="16" height="16" />
									</Button>
								</React.Fragment>
							)
						}
					</div>
					<div className="modal-body" tabIndex={ 0 }>
						<div className="style-search">
							<Input
								autoFocus
								className="form-control form-control-lg search-input"
								isBusy={ isSearching }
								onChange={ handleFilterInputChange }
								placeholder="Search"
								tabIndex={ 0 }
								type="text"
								value={ filterInputValue }
							/>
						</div>
						<ul className="style-list">
							{
								(hasResults ? matchedCitationStyles : localCitationStyles).map(
								style => {
									const styleData = localCitationStyles.find(cs => cs.name === style.name);
									const isInstalled = typeof styleData !== 'undefined';
									const isCore = isInstalled && styleData.isCore || false;
									const isActive = style.name === currentCitationStyle;
									const isSelected = matchedCitationStyles[selectedIndex] ?
										matchedCitationStyles[selectedIndex].name === style.name : false;

									return <StyleItem
										isActive={ isActive }
										isCore={ isCore }
										isInstalled={ isInstalled }
										isSelected={ isSelected }
										key={ style.name }
										onDelete={ handleDelete }
										onInstall={ handleInstall }
										style={ style }
									/>;
								}
		)
							}
						</ul>
					</div>
				</div>
			</CSSTransition>
			{ !isReady && <Spinner className="large" /> }
		</Modal>
	);
}

export default memo(StyleInstallerModal);
